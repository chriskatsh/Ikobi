// Cœur métier d'Ikobi : tontines (likelemba) à tour de rôle.
//
// Règles :
// - Un groupe se forme (status=forming), puis l'admin le démarre (status=active).
// - Au démarrage, un tour (cycle) est créé par membre ; l'ordre de passage est
//   l'ordre d'arrivée ou un tirage au sort.
// - À chaque tour, tous les membres SAUF le bénéficiaire cotisent le montant fixé.
//   Cagnotte du tour = montant × (membres − 1).
// - Quand tout le monde a payé, le tour passe « ready » ; le versement au bénéficiaire
//   est déclenché par l'admin (ou automatiquement si PAYOUT_MODE=auto).
// - Le versement réussi clôt le tour et ouvre le suivant. Après le dernier : groupe terminé.

import crypto from 'node:crypto';
import { insertId } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { addPeriods, today, formatDateFr, toMs } from '../lib/dates.js';
import { formatMoney, fromMinor } from '../lib/money.js';
import { normalizePhone, detectMethod, METHODS } from '../lib/phone.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function inviteCode() {
  const b = crypto.randomBytes(6);
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
}

function reference(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

const PENDING_DEDUP_MS = 3 * 60 * 1000;

export function createTontineService({ db, moko, notifier, config, logger = console }) {
  const callbackUrl = `${config.publicUrl}/webhooks/moko`;

  async function membership(groupId, userId) {
    return db('memberships').where({ group_id: groupId, user_id: userId }).first();
  }

  async function requireMember(groupId, userId) {
    const g = await db('groups').where({ id: groupId }).first();
    if (!g) throw notFound('Groupe introuvable');
    const m = await membership(groupId, userId);
    if (!m) throw forbidden("Tu n'es pas membre de ce groupe");
    return { group: g, member: m };
  }

  async function currentCycle(groupId) {
    return db('cycles').where({ group_id: groupId }).whereIn('status', ['open', 'ready', 'paying_out']).orderBy('number').first();
  }

  async function memberCount(groupId) {
    const r = await db('memberships').where({ group_id: groupId }).count({ c: '*' }).first();
    return Number(r.c);
  }

  async function paidUserIds(cycleId) {
    const rows = await db('contributions').where({ cycle_id: cycleId, status: 'success' }).distinct('user_id');
    return new Set(rows.map((r) => r.user_id));
  }

  function potMinor(group, members) {
    return Number(group.amount_minor) * Math.max(members - 1, 0);
  }

  async function createGroup(userId, input) {
    const payoutPhone = normalizePhone(input.payoutPhone);
    if (!payoutPhone) throw badRequest('invalid_phone', 'Numéro Mobile Money invalide');
    const payoutMethod = input.payoutMethod || detectMethod(payoutPhone);
    if (!METHODS[payoutMethod]) throw badRequest('invalid_method', 'Opérateur Mobile Money inconnu');

    let code;
    for (let i = 0; i < 5; i++) {
      code = inviteCode();
      if (!(await db('groups').where({ invite_code: code }).first())) break;
    }
    return db.transaction(async (trx) => {
      const groupId = await insertId(trx('groups').insert({
        name: input.name.trim(),
        description: (input.description || '').trim(),
        amount_minor: input.amountMinor,
        currency: input.currency,
        frequency: input.frequency,
        max_members: input.maxMembers,
        start_date: input.startDate,
        invite_code: code,
        created_by: userId,
      }, ['id']));
      await trx('memberships').insert({
        group_id: groupId, user_id: userId, role: 'admin', position: 1,
        payout_phone: payoutPhone, payout_method: payoutMethod,
      });
      return groupId;
    });
  }

  async function joinGroup(userId, { code, payoutPhone, payoutMethod }) {
    const g = await db('groups').where({ invite_code: String(code || '').trim().toUpperCase() }).first();
    if (!g) throw notFound("Code d'invitation introuvable");
    if (await membership(g.id, userId)) return g.id; // déjà membre : idempotent
    if (g.status !== 'forming') throw conflict('group_started', 'Ce groupe a déjà démarré');
    const phone = normalizePhone(payoutPhone);
    if (!phone) throw badRequest('invalid_phone', 'Numéro Mobile Money invalide');
    const method = payoutMethod || detectMethod(phone);
    if (!METHODS[method]) throw badRequest('invalid_method', 'Opérateur Mobile Money inconnu');

    await db.transaction(async (trx) => {
      const r = await trx('memberships').where({ group_id: g.id }).count({ c: '*' }).max({ p: 'position' }).first();
      if (Number(r.c) >= g.max_members) throw conflict('group_full', 'Ce groupe est complet');
      await trx('memberships').insert({
        group_id: g.id, user_id: userId, role: 'member', position: Number(r.p || 0) + 1,
        payout_phone: phone, payout_method: method,
      });
    });
    const joiner = await db('users').where({ id: userId }).first();
    const admins = await db('memberships').where({ group_id: g.id, role: 'admin' });
    for (const a of admins) {
      await notifier.user(a.user_id, {
        title: g.name,
        body: `${joiner.name || 'Un membre'} a rejoint la tontine.`,
        data: { groupId: g.id },
      });
    }
    return g.id;
  }

  async function startGroup(userId, groupId, { order = 'join', startDate } = {}) {
    const { group, member } = await requireMember(groupId, userId);
    if (member.role !== 'admin') throw forbidden("Seul l'administrateur peut démarrer la tontine");
    if (group.status !== 'forming') throw conflict('already_started', 'La tontine a déjà démarré');
    const members = await db('memberships').where({ group_id: groupId }).orderBy('position');
    if (members.length < 2) throw badRequest('not_enough_members', 'Il faut au moins 2 membres pour démarrer');

    let ordered = members;
    if (order === 'random') {
      ordered = [...members];
      for (let i = ordered.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      }
    }
    const first = startDate && startDate >= today() ? startDate : (group.start_date >= today() ? group.start_date : today());

    await db.transaction(async (trx) => {
      for (let i = 0; i < ordered.length; i++) {
        await trx('memberships').where({ id: ordered[i].id }).update({ position: i + 1 });
        await trx('cycles').insert({
          group_id: groupId,
          number: i + 1,
          due_date: addPeriods(first, group.frequency, i),
          beneficiary_id: ordered[i].user_id,
          status: i === 0 ? 'open' : 'scheduled',
        });
      }
      await trx('groups').where({ id: groupId }).update({ status: 'active', start_date: first, updated_at: trx.fn.now() });
    });

    for (const m of members) {
      await notifier.user(m.user_id, {
        title: group.name,
        body: `La tontine démarre ! Première échéance le ${formatDateFr(first)}.`,
        data: { groupId },
      });
    }
  }

  async function groupDetail(userId, groupId) {
    const { group, member } = await requireMember(groupId, userId);
    const members = await db('memberships as m')
      .join('users as u', 'u.id', 'm.user_id')
      .where('m.group_id', groupId)
      .orderBy('m.position')
      .select('u.id', 'u.name', 'u.phone', 'm.role', 'm.position');
    const cycles = await db('cycles').where({ group_id: groupId }).orderBy('number');
    const cycle = cycles.find((c) => ['open', 'ready', 'paying_out'].includes(c.status));
    const paid = cycle ? await paidUserIds(cycle.id) : new Set();
    const n = members.length;

    let myPending = null;
    if (cycle) {
      myPending = await db('contributions')
        .where({ cycle_id: cycle.id, user_id: userId, status: 'pending' })
        .orderBy('id', 'desc').first();
    }

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      amount: fromMinor(Number(group.amount_minor)),
      currency: group.currency,
      frequency: group.frequency,
      maxMembers: group.max_members,
      startDate: group.start_date,
      status: group.status,
      inviteCode: group.invite_code,
      myRole: member.role,
      pot: fromMinor(potMinor(group, n)),
      members: members.map((m) => ({
        id: m.id,
        name: m.name || 'Membre',
        phoneEnd: String(m.phone).slice(-4),
        role: m.role,
        position: m.position,
        paidCurrent: cycle ? (m.id === cycle.beneficiary_id ? null : paid.has(m.id)) : null,
      })),
      currentCycle: cycle
        ? {
            number: cycle.number,
            dueDate: cycle.due_date,
            status: cycle.status,
            beneficiaryId: cycle.beneficiary_id,
            paidCount: paid.size,
            expectedCount: n - 1,
            iAmBeneficiary: cycle.beneficiary_id === userId,
            iHavePaid: paid.has(userId),
            myPendingContributionId: myPending?.id ?? null,
          }
        : null,
      cycles: cycles.map((c) => ({ number: c.number, dueDate: c.due_date, beneficiaryId: c.beneficiary_id, status: c.status })),
      totalCycles: cycles.length,
    };
  }

  async function myGroups(userId) {
    const groups = await db('memberships as m')
      .join('groups as g', 'g.id', 'm.group_id')
      .where('m.user_id', userId)
      .orderBy('g.created_at', 'desc')
      .select('g.*', 'm.role');
    const out = [];
    for (const g of groups) {
      const n = await memberCount(g.id);
      const cycle = g.status === 'active' ? await currentCycle(g.id) : null;
      const paid = cycle ? await paidUserIds(cycle.id) : new Set();
      out.push({
        id: g.id,
        name: g.name,
        amount: fromMinor(Number(g.amount_minor)),
        currency: g.currency,
        frequency: g.frequency,
        status: g.status,
        role: g.role,
        members: n,
        maxMembers: g.max_members,
        pot: fromMinor(potMinor(g, n)),
        currentCycle: cycle
          ? {
              number: cycle.number,
              dueDate: cycle.due_date,
              iAmBeneficiary: cycle.beneficiary_id === userId,
              iHavePaid: paid.has(userId),
              paidCount: paid.size,
              expectedCount: n - 1,
            }
          : null,
      });
    }
    return out;
  }

  // Liste des cotisations dues par un membre (tours ouverts non payés, hors bénéficiaire).
  async function duesForUser(userId) {
    const rows = await db('memberships as m')
      .join('groups as g', 'g.id', 'm.group_id')
      .join('cycles as c', 'c.group_id', 'g.id')
      .where('m.user_id', userId)
      .andWhere('g.status', 'active')
      .andWhere('c.status', 'open')
      .andWhereNot('c.beneficiary_id', userId)
      .select('g.id as group_id', 'g.name', 'g.amount_minor', 'g.currency', 'c.id as cycle_id', 'c.number', 'c.due_date');
    const out = [];
    for (const r of rows) {
      const paid = await db('contributions').where({ cycle_id: r.cycle_id, user_id: userId, status: 'success' }).first();
      if (!paid) out.push(r);
    }
    return out;
  }

  async function initiateContribution(userId, groupId, { phone, method, channel = 'app' }) {
    const { group } = await requireMember(groupId, userId);
    if (group.status !== 'active') throw conflict('not_active', "La tontine n'a pas encore démarré");
    const cycle = await currentCycle(groupId);
    if (!cycle || cycle.status !== 'open') throw conflict('no_open_cycle', "Aucune cotisation n'est attendue pour le moment");
    if (cycle.beneficiary_id === userId) throw conflict('is_beneficiary', "Tu es le bénéficiaire de ce tour : tu n'as rien à payer");

    const payPhone = normalizePhone(phone);
    if (!payPhone) throw badRequest('invalid_phone', 'Numéro Mobile Money invalide');
    const payMethod = method || detectMethod(payPhone);
    if (!METHODS[payMethod]) throw badRequest('invalid_method', 'Opérateur Mobile Money inconnu');

    const existing = await db('contributions').where({ cycle_id: cycle.id, user_id: userId }).whereIn('status', ['success', 'pending']).orderBy('id', 'desc');
    if (existing.some((c) => c.status === 'success')) throw conflict('already_paid', 'Tu as déjà payé ce tour');
    const pending = existing.find((c) => c.status === 'pending');
    if (pending) {
      const age = Date.now() - toMs(pending.created_at);
      if (age < PENDING_DEDUP_MS) return { contribution: pending, reused: true };
      // Paiement ancien resté en attente : on vérifie chez MOKO avant d'en relancer un.
      const v = await moko.verify(pending.reference);
      if (v.status !== 'pending') {
        await applyContributionResult(pending.reference, v.status, v.providerTxId, v.description);
        if (v.status === 'success') throw conflict('already_paid', 'Tu as déjà payé ce tour');
      } else {
        await db('contributions').where({ id: pending.id }).update({ status: 'failed', failure_reason: 'Expiré sans confirmation', updated_at: db.fn.now() });
      }
    }

    const user = await db('users').where({ id: userId }).first();
    const ref = reference('IKC');
    const id = await insertId(db('contributions').insert({
      cycle_id: cycle.id,
      user_id: userId,
      amount_minor: group.amount_minor,
      currency: group.currency,
      method: payMethod,
      phone: payPhone,
      channel,
      reference: ref,
    }, ['id']));

    const [firstname, ...rest] = (user.name || 'Membre Ikobi').split(' ');
    const r = await moko.debit({
      amount: fromMinor(Number(group.amount_minor)),
      currency: group.currency,
      phone: payPhone,
      method: payMethod,
      reference: ref,
      firstname,
      lastname: rest.join(' ') || 'Ikobi',
      callbackUrl,
    });
    if (!r.accepted) {
      await db('contributions').where({ id }).update({ status: 'failed', failure_reason: r.error, updated_at: db.fn.now() });
      throw badRequest('payment_refused', r.error || 'Paiement refusé par l\'opérateur');
    }
    await db('contributions').where({ id }).update({ provider_tx_id: r.providerTxId, updated_at: db.fn.now() });
    if (r.finalStatus && r.finalStatus !== 'pending') await applyContributionResult(ref, r.finalStatus, r.providerTxId);
    return { contribution: await db('contributions').where({ id }).first(), reused: false };
  }

  // Idempotent : appliqué par le callback MOKO, la vérification manuelle ou le polling.
  async function applyContributionResult(ref, status, providerTxId, reason) {
    if (status === 'pending') return null;
    const c = await db('contributions').where({ reference: ref }).first();
    if (!c || c.status !== 'pending') return c || null;

    const changed = await db('contributions')
      .where({ id: c.id, status: 'pending' })
      .update({
        status,
        provider_tx_id: providerTxId || c.provider_tx_id,
        failure_reason: status === 'failed' ? String(reason || 'Paiement refusé ou annulé').slice(0, 200) : null,
        updated_at: db.fn.now(),
      });
    if (!changed) return c; // traité en parallèle

    const cycle = await db('cycles').where({ id: c.cycle_id }).first();
    const group = await db('groups').where({ id: cycle.group_id }).first();
    const amount = formatMoney(Number(c.amount_minor), c.currency);

    if (status === 'success') {
      await notifier.user(c.user_id, {
        title: '✅ Cotisation reçue',
        body: `${amount} pour « ${group.name} » (tour ${cycle.number}).`,
        data: { groupId: group.id },
        whatsappText: `✅ Cotisation reçue : *${amount}* pour *${group.name}* (tour ${cycle.number}). Merci !`,
      });
      await checkCycleComplete(cycle.id);
    } else {
      await notifier.user(c.user_id, {
        title: 'Paiement non abouti',
        body: `Ta cotisation de ${amount} pour « ${group.name} » n'a pas abouti. Réessaie.`,
        data: { groupId: group.id },
        whatsappText: `❌ Ta cotisation de *${amount}* pour *${group.name}* n'a pas abouti. Écris *cotiser* pour réessayer.`,
      });
    }
    return db('contributions').where({ id: c.id }).first();
  }

  async function checkCycleComplete(cycleId) {
    const cycle = await db('cycles').where({ id: cycleId }).first();
    if (cycle.status !== 'open') return;
    const n = await memberCount(cycle.group_id);
    const paid = await paidUserIds(cycle.id);
    paid.delete(cycle.beneficiary_id);
    if (paid.size < n - 1) return;

    const moved = await db('cycles').where({ id: cycleId, status: 'open' }).update({ status: 'ready', updated_at: db.fn.now() });
    if (!moved) return;
    const group = await db('groups').where({ id: cycle.group_id }).first();
    const pot = formatMoney(potMinor(group, n), group.currency);

    await notifier.user(cycle.beneficiary_id, {
      title: '🎉 La cagnotte est complète',
      body: `Tous les membres de « ${group.name} » ont cotisé : ${pot} pour toi.`,
      data: { groupId: group.id },
      whatsappText: `🎉 Tous les membres de *${group.name}* ont cotisé. La cagnotte de *${pot}* est pour toi !`,
    });
    if (config.payoutMode === 'auto') {
      await initiatePayout(null, group.id, cycle.number).catch((e) => logger.error?.({ err: e.message }, 'Versement auto échoué'));
    } else {
      const admins = await db('memberships').where({ group_id: group.id, role: 'admin' });
      for (const a of admins) {
        await notifier.user(a.user_id, {
          title: group.name,
          body: `Tour ${cycle.number} complet : verse ${pot} au bénéficiaire.`,
          data: { groupId: group.id },
        });
      }
    }
  }

  async function initiatePayout(adminId, groupId, cycleNumber) {
    const group = await db('groups').where({ id: groupId }).first();
    if (!group) throw notFound('Groupe introuvable');
    if (adminId !== null) {
      const m = await membership(groupId, adminId);
      if (!m || m.role !== 'admin') throw forbidden("Seul l'administrateur peut déclencher le versement");
    }
    const cycle = await db('cycles').where({ group_id: groupId, number: cycleNumber }).first();
    if (!cycle) throw notFound('Tour introuvable');
    if (cycle.status !== 'ready') throw conflict('cycle_not_ready', 'Toutes les cotisations ne sont pas encore reçues');

    const locked = await db('cycles').where({ id: cycle.id, status: 'ready' }).update({ status: 'paying_out', updated_at: db.fn.now() });
    if (!locked) throw conflict('payout_in_progress', 'Versement déjà en cours');

    const n = await memberCount(groupId);
    const amountMinor = potMinor(group, n);
    const bm = await membership(groupId, cycle.beneficiary_id);
    const ben = await db('users').where({ id: cycle.beneficiary_id }).first();
    const ref = reference('IKP');
    await db('payouts').insert({
      cycle_id: cycle.id, user_id: ben.id, amount_minor: amountMinor, currency: group.currency,
      method: bm.payout_method, phone: bm.payout_phone, reference: ref,
    });
    const [firstname, ...rest] = (ben.name || 'Membre Ikobi').split(' ');
    const r = await moko.credit({
      amount: fromMinor(amountMinor), currency: group.currency, phone: bm.payout_phone, method: bm.payout_method,
      reference: ref, firstname, lastname: rest.join(' ') || 'Ikobi', callbackUrl,
    });
    if (!r.accepted) {
      await db('payouts').where({ reference: ref }).update({ status: 'failed', failure_reason: r.error, updated_at: db.fn.now() });
      await db('cycles').where({ id: cycle.id }).update({ status: 'ready', updated_at: db.fn.now() });
      throw badRequest('payout_refused', r.error || 'Versement refusé');
    }
    await db('payouts').where({ reference: ref }).update({ provider_tx_id: r.providerTxId, updated_at: db.fn.now() });
    if (r.finalStatus && r.finalStatus !== 'pending') await applyPayoutResult(ref, r.finalStatus, r.providerTxId);
    return db('payouts').where({ reference: ref }).first();
  }

  async function applyPayoutResult(ref, status, providerTxId, reason) {
    if (status === 'pending') return null;
    const p = await db('payouts').where({ reference: ref }).first();
    if (!p || p.status !== 'pending') return p || null;
    const changed = await db('payouts').where({ id: p.id, status: 'pending' }).update({
      status, provider_tx_id: providerTxId || p.provider_tx_id,
      failure_reason: status === 'failed' ? String(reason || 'Versement échoué').slice(0, 200) : null,
      updated_at: db.fn.now(),
    });
    if (!changed) return p;
    const cycle = await db('cycles').where({ id: p.cycle_id }).first();
    const group = await db('groups').where({ id: cycle.group_id }).first();
    const amount = formatMoney(Number(p.amount_minor), p.currency);

    if (status === 'failed') {
      await db('cycles').where({ id: cycle.id }).update({ status: 'ready', updated_at: db.fn.now() });
      const admins = await db('memberships').where({ group_id: group.id, role: 'admin' });
      for (const a of admins) {
        await notifier.user(a.user_id, { title: group.name, body: `Le versement de ${amount} a échoué. Réessaie depuis l'app.`, data: { groupId: group.id } });
      }
      return p;
    }

    await db.transaction(async (trx) => {
      await trx('cycles').where({ id: cycle.id }).update({ status: 'closed', updated_at: trx.fn.now() });
      const next = await trx('cycles').where({ group_id: group.id, number: cycle.number + 1 }).first();
      if (next) await trx('cycles').where({ id: next.id }).update({ status: 'open', updated_at: trx.fn.now() });
      else await trx('groups').where({ id: group.id }).update({ status: 'completed', updated_at: trx.fn.now() });
    });

    await notifier.user(p.user_id, {
      title: '💰 Cagnotte versée',
      body: `${amount} ont été envoyés sur ton Mobile Money (« ${group.name} »).`,
      data: { groupId: group.id },
      whatsappText: `💰 *${amount}* ont été envoyés sur ton Mobile Money pour *${group.name}*. Félicitations !`,
    });
    const members = await db('memberships').where({ group_id: group.id });
    const next = await db('cycles').where({ group_id: group.id, status: 'open' }).first();
    for (const m of members) {
      if (m.user_id === p.user_id) continue;
      await notifier.user(m.user_id, {
        title: group.name,
        body: next
          ? `Tour ${cycle.number} terminé. Prochaine échéance : ${formatDateFr(next.due_date)}.`
          : 'La tontine est terminée. Bravo à tous !',
        data: { groupId: group.id },
      });
    }
    return db('payouts').where({ id: p.id }).first();
  }

  // Résultat MOKO quel que soit le type (cotisation ou versement).
  async function applyProviderResult(ref, status, providerTxId, reason) {
    if (String(ref).startsWith('IKP-')) return applyPayoutResult(ref, status, providerTxId, reason);
    return applyContributionResult(ref, status, providerTxId, reason);
  }

  async function contributionStatus(userId, contributionId) {
    const c = await db('contributions').where({ id: contributionId, user_id: userId }).first();
    if (!c) throw notFound('Paiement introuvable');
    // Rattrapage si le callback tarde : on interroge MOKO après 20 s.
    if (c.status === 'pending' && Date.now() - toMs(c.created_at) > 20000) {
      const v = await moko.verify(c.reference).catch(() => ({ status: 'pending' }));
      if (v.status !== 'pending') await applyContributionResult(c.reference, v.status, v.providerTxId, v.description);
    }
    const fresh = await db('contributions').where({ id: contributionId }).first();
    return {
      id: fresh.id,
      status: fresh.status,
      amount: fromMinor(Number(fresh.amount_minor)),
      currency: fresh.currency,
      method: fresh.method,
      reference: fresh.reference,
      failureReason: fresh.failure_reason,
    };
  }

  async function history(userId, groupId) {
    await requireMember(groupId, userId);
    const contributions = await db('contributions as c')
      .join('cycles as cy', 'cy.id', 'c.cycle_id')
      .join('users as u', 'u.id', 'c.user_id')
      .where('cy.group_id', groupId)
      .whereIn('c.status', ['success'])
      .orderBy('c.updated_at', 'desc')
      .limit(200)
      .select('c.id', 'u.name', 'c.amount_minor', 'c.currency', 'c.method', 'c.channel', 'cy.number', 'c.updated_at');
    const payouts = await db('payouts as p')
      .join('cycles as cy', 'cy.id', 'p.cycle_id')
      .join('users as u', 'u.id', 'p.user_id')
      .where('cy.group_id', groupId)
      .orderBy('p.updated_at', 'desc')
      .select('p.id', 'u.name', 'p.amount_minor', 'p.currency', 'p.status', 'cy.number', 'p.updated_at');
    return {
      contributions: contributions.map((c) => ({ id: c.id, name: c.name, amount: fromMinor(Number(c.amount_minor)), currency: c.currency, method: c.method, channel: c.channel, cycle: c.number, at: c.updated_at })),
      payouts: payouts.map((p) => ({ id: p.id, name: p.name, amount: fromMinor(Number(p.amount_minor)), currency: p.currency, status: p.status, cycle: p.number, at: p.updated_at })),
    };
  }

  return {
    createGroup, joinGroup, startGroup, groupDetail, myGroups, duesForUser,
    initiateContribution, applyContributionResult, applyPayoutResult, applyProviderResult,
    initiatePayout, contributionStatus, history, currentCycle, memberCount, paidUserIds, potMinor,
  };
}
