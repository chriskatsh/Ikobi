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

export function createTontineService({ db, payments, ledger, fees, audit, notifier, config, logger = console }) {
  const callbackUrl = (provider) => `${config.publicUrl}/webhooks/${provider}`;

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
    const country = input.country || 'CD';
    if (!payments.supportedCurrencies(country).includes(input.currency)) {
      throw badRequest('currency_unavailable', `Devise ${input.currency} indisponible pour le moment. Devises acceptées : ${payments.supportedCurrencies(country).join(', ') || 'aucune'}`);
    }
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

    const fin = cycle ? await cycleFinancials(cycle, group, n) : null;
    const req = cycle ? await db('payout_requests').where({ cycle_id: cycle.id }).orderBy('id', 'desc').first() : null;
    const myTotal = await db('contributions as c').join('cycles as cy', 'cy.id', 'c.cycle_id')
      .where({ 'cy.group_id': groupId, 'c.user_id': userId, 'c.status': 'success' }).sum({ s: 'c.amount_minor' }).first();
    const myCycle = cycles.find((c) => c.beneficiary_id === userId);
    const myPayout = myCycle ? await db('payouts').where({ cycle_id: myCycle.id, status: 'success' }).first() : null;

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
            scheduled: fromMinor(fin.scheduledMinor),
            collected: fromMinor(fin.collectedMinor),
            settled: fromMinor(fin.settledMinor),
            paid: fromMinor(fin.paidMinor),
            pendingPayments: fin.pendingCount,
            payoutRequest: req ? { id: req.id, status: req.status, note: req.review_note } : null,
          }
        : null,
      me: {
        totalPaid: fromMinor(Number(myTotal?.s || 0)),
        position: myCycle?.number ?? null,
        expectedPayoutDate: myCycle?.due_date ?? null,
        payoutReceived: myPayout ? fromMinor(Number(myPayout.amount_minor) - Number(myPayout.fee_minor)) : null,
      },
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

  // ---------------------------------------------------------------------------
  // Cotisations
  // ---------------------------------------------------------------------------

  async function quoteContribution(userId, groupId, method) {
    const { group } = await requireMember(groupId, userId);
    const m = METHODS[method] ? method : null;
    const provider = m ? payments.route(group.country, m, group.currency).name : null;
    const q = await fees.quoteContribution({
      principalMinor: Number(group.amount_minor), currency: group.currency, country: group.country, provider, method: m,
    });
    return {
      currency: group.currency,
      principal: fromMinor(q.principalMinor),
      fee: fromMinor(q.feeMinor),
      total: fromMinor(q.totalMinor),
      provider,
      methods: payments.supportedMethods(group.country),
    };
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
    const { name: providerName, client: provider } = payments.route(group.country, payMethod, group.currency);

    const existing = await db('contributions').where({ cycle_id: cycle.id, user_id: userId }).whereIn('status', ['success', 'pending']).orderBy('id', 'desc');
    if (existing.some((c) => c.status === 'success')) throw conflict('already_paid', 'Tu as déjà payé ce tour');
    const pending = existing.find((c) => c.status === 'pending');
    if (pending) {
      const age = Date.now() - toMs(pending.created_at);
      if (age < PENDING_DEDUP_MS) return { contribution: pending, reused: true };
      // Paiement ancien resté en attente : on vérifie chez le fournisseur avant d'en relancer un.
      const v = await payments.get(pending.provider).verify(pending.reference);
      if (v.status !== 'pending') {
        await applyContributionResult(pending.reference, v.status, v.providerTxId, v.description, 'verify');
        if (v.status === 'success') throw conflict('already_paid', 'Tu as déjà payé ce tour');
      } else {
        // On ne marque PAS « échoué » un paiement peut-être débité : on bloque et on laisse la réconciliation trancher.
        throw conflict('payment_unconfirmed', 'Ton paiement précédent est toujours en attente de confirmation. Réessaie dans quelques minutes.');
      }
    }

    const quote = await fees.quoteContribution({
      principalMinor: Number(group.amount_minor), currency: group.currency, country: group.country, provider: providerName, method: payMethod,
    });
    const user = await db('users').where({ id: userId }).first();
    const ref = reference('IKC');
    const id = await insertId(db('contributions').insert({
      cycle_id: cycle.id,
      user_id: userId,
      amount_minor: quote.principalMinor,
      fee_minor: quote.feeMinor,
      currency: group.currency,
      method: payMethod,
      provider: providerName,
      phone: payPhone,
      channel,
      reference: ref,
    }, ['id']));
    await audit.log({ actorId: userId, action: 'contribution.initiated', entity: 'contribution', entityId: ref, data: { groupId, cycle: cycle.number, principal: quote.principalMinor, fee: quote.feeMinor, method: payMethod, channel } });

    const [firstname, ...rest] = (user.name || 'Membre Ikobi').split(' ');
    const r = await provider.debit({
      amount: fromMinor(quote.totalMinor),
      currency: group.currency,
      phone: payPhone,
      method: payMethod,
      reference: ref,
      firstname,
      lastname: rest.join(' ') || 'Ikobi',
      callbackUrl: callbackUrl(providerName),
    });
    if (!r.accepted) {
      await db('contributions').where({ id }).update({ status: 'failed', failure_reason: r.error, updated_at: db.fn.now() });
      await audit.log({ actorType: 'provider', action: 'contribution.refused', entity: 'contribution', entityId: ref, data: { code: r.errorCode } });
      throw badRequest('payment_refused', r.error || "Paiement refusé par l'opérateur");
    }
    await db('contributions').where({ id }).update({ provider_tx_id: r.providerTxId, updated_at: db.fn.now() });
    if (r.finalStatus && r.finalStatus !== 'pending') await applyContributionResult(ref, r.finalStatus, r.providerTxId, null, 'initiate');
    return { contribution: await db('contributions').where({ id }).first(), reused: false };
  }

  // Idempotent : appliqué par le callback, la vérification ou le polling.
  // Succès = « collecté » chez le fournisseur (pas encore réglé sur le compte marchand).
  async function applyContributionResult(ref, status, providerTxId, reason, source = 'callback') {
    if (status === 'pending') return null;
    const c = await db('contributions').where({ reference: ref }).first();
    if (!c || c.status !== 'pending') return c || null;

    const applied = await db.transaction(async (trx) => {
      const changed = await trx('contributions')
        .where({ id: c.id, status: 'pending' })
        .update({
          status,
          provider_tx_id: providerTxId || c.provider_tx_id,
          failure_reason: status === 'failed' ? String(reason || 'Paiement refusé ou annulé').slice(0, 200) : null,
          updated_at: trx.fn.now(),
        });
      if (!changed) return false;
      if (status === 'success') {
        const cycle = await trx('cycles').where({ id: c.cycle_id }).first();
        const total = Number(c.amount_minor) + Number(c.fee_minor);
        await ledger.post({
          kind: 'contribution_collected', refType: 'contribution', refId: c.reference, currency: c.currency,
          memo: `Cotisation tour ${cycle.number}`,
          lines: [
            { account: `clearing:${c.provider}`, debit: total },
            { account: `pool:${cycle.group_id}`, credit: Number(c.amount_minor) },
            ...(Number(c.fee_minor) > 0 ? [{ account: 'revenue:fees', credit: Number(c.fee_minor) }] : []),
          ],
        }, trx);
      }
      await audit.log({ actorType: 'provider', action: `contribution.${status}`, entity: 'contribution', entityId: ref, data: { source, providerTxId } }, trx);
      return true;
    });
    if (!applied) return c;

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
      title: 'Toutes les cotisations sont collectées',
      body: `« ${group.name} » : ${pot} collectés pour toi. Le versement suit sa validation.`,
      data: { groupId: group.id },
      whatsappText: `📥 Tous les membres de *${group.name}* ont cotisé (${pot}). Le versement te sera envoyé après validation.`,
    });
    const admins = await db('memberships').where({ group_id: group.id, role: 'admin' });
    for (const a of admins) {
      await notifier.user(a.user_id, { title: group.name, body: `Tour ${cycle.number} complet : demande le versement de ${pot}.`, data: { groupId: group.id } });
    }
  }

  // ---------------------------------------------------------------------------
  // Versements : demande (organisateur) → approbation (équipe Ikobi) → exécution
  // ---------------------------------------------------------------------------

  async function cycleFinancials(cycle, group, n) {
    const rows = await db('contributions').where({ cycle_id: cycle.id, status: 'success' });
    const byUser = new Map(rows.filter((r) => r.user_id !== cycle.beneficiary_id).map((r) => [r.user_id, r]));
    const collected = [...byUser.values()];
    const settled = collected.filter((r) => r.settlement_status === 'settled');
    const payout = await db('payouts').where({ cycle_id: cycle.id, status: 'success' }).first();
    return {
      scheduledMinor: Number(group.amount_minor) * Math.max(n - 1, 0),
      collectedMinor: collected.reduce((s, r) => s + Number(r.amount_minor), 0),
      settledMinor: settled.reduce((s, r) => s + Number(r.amount_minor), 0),
      paidMinor: payout ? Number(payout.amount_minor) : 0,
      collectedCount: collected.length,
      settledCount: settled.length,
      pendingCount: await db('contributions').where({ cycle_id: cycle.id, status: 'pending' }).count({ c: '*' }).first().then((r) => Number(r.c)),
    };
  }

  async function payoutPreconditions(cycle, group) {
    const n = await memberCount(group.id);
    const f = await cycleFinancials(cycle, group, n);
    const gross = potMinor(group, n);
    const reasons = [];
    if (f.collectedCount < n - 1) reasons.push(`Cotisations collectées : ${f.collectedCount}/${n - 1}`);
    if (config.requireSettlement && f.settledCount < n - 1) reasons.push(`Cotisations réglées sur le compte marchand : ${f.settledCount}/${n - 1}`);
    const pool = -(await ledger.balance(`pool:${group.id}`, group.currency)); // passif : solde créditeur
    if (pool < gross) reasons.push(`Solde de la tontine au grand livre insuffisant (${fromMinor(pool)} < ${fromMinor(gross)})`);
    return { ok: reasons.length === 0, reasons, grossMinor: gross, financials: f };
  }

  async function requestPayout(userId, groupId, cycleNumber) {
    const { group, member } = await requireMember(groupId, userId);
    if (member.role !== 'admin') throw forbidden("Seul l'organisateur peut demander le versement");
    const cycle = await db('cycles').where({ group_id: groupId, number: cycleNumber }).first();
    if (!cycle) throw notFound('Tour introuvable');
    if (cycle.status !== 'ready') throw conflict('cycle_not_ready', 'Toutes les cotisations ne sont pas encore collectées');
    const active = await db('payout_requests').where({ cycle_id: cycle.id }).whereIn('status', ['requested', 'approved', 'executed']).first();
    if (active) throw conflict('payout_already_requested', 'Un versement est déjà demandé pour ce tour');
    const id = await insertId(db('payout_requests').insert({ cycle_id: cycle.id, requested_by: userId }, ['id']));
    await audit.log({ actorId: userId, action: 'payout.requested', entity: 'payout_request', entityId: id, data: { groupId, cycle: cycleNumber } });
    const reviewers = await db('users').whereIn('platform_role', ['finance', 'admin']);
    for (const r of reviewers) {
      await notifier.user(r.id, { title: 'Versement à valider', body: `« ${group.name} », tour ${cycleNumber}.`, data: { payoutRequestId: id } });
    }
    return db('payout_requests').where({ id }).first();
  }

  async function reviewPayout(reviewerId, requestId, { decision, note }) {
    const reviewer = await db('users').where({ id: reviewerId }).first();
    if (!['finance', 'admin'].includes(reviewer?.platform_role)) throw forbidden('Réservé à l’équipe finance Ikobi');
    const req = await db('payout_requests').where({ id: requestId }).first();
    if (!req) throw notFound('Demande introuvable');
    if (req.status !== 'requested') throw conflict('already_reviewed', 'Demande déjà traitée');
    const cycle = await db('cycles').where({ id: req.cycle_id }).first();
    // Séparation des tâches : on ne valide ni sa propre demande, ni un versement dont on est bénéficiaire.
    if (req.requested_by === reviewerId) throw forbidden('Tu ne peux pas valider ta propre demande');
    if (cycle.beneficiary_id === reviewerId) throw forbidden('Tu ne peux pas valider un versement dont tu es bénéficiaire');
    const group = await db('groups').where({ id: cycle.group_id }).first();

    if (decision === 'reject') {
      const ok = await db('payout_requests').where({ id: requestId, status: 'requested' }).update({ status: 'rejected', reviewed_by: reviewerId, review_note: (note || '').slice(0, 200), updated_at: db.fn.now() });
      if (!ok) throw conflict('already_reviewed', 'Demande déjà traitée');
      await audit.log({ actorId: reviewerId, action: 'payout.rejected', entity: 'payout_request', entityId: requestId, data: { note } });
      return db('payout_requests').where({ id: requestId }).first();
    }

    const pre = await payoutPreconditions(cycle, group);
    if (!pre.ok) {
      await audit.log({ actorId: reviewerId, action: 'payout.blocked', entity: 'payout_request', entityId: requestId, data: { reasons: pre.reasons } });
      throw conflict('payout_preconditions', `Versement impossible : ${pre.reasons.join(' · ')}`);
    }
    const ok = await db('payout_requests').where({ id: requestId, status: 'requested' }).update({ status: 'approved', reviewed_by: reviewerId, review_note: (note || '').slice(0, 200), updated_at: db.fn.now() });
    if (!ok) throw conflict('already_reviewed', 'Demande déjà traitée');
    await audit.log({ actorId: reviewerId, action: 'payout.approved', entity: 'payout_request', entityId: requestId });
    return executePayout(req, cycle, group, pre.grossMinor, reviewerId);
  }

  async function executePayout(req, cycle, group, grossMinor, actorId) {
    // Verrou : un seul passage ready → paying_out, donc jamais deux versements pour un tour.
    const locked = await db('cycles').where({ id: cycle.id, status: 'ready' }).update({ status: 'paying_out', updated_at: db.fn.now() });
    if (!locked) throw conflict('payout_in_progress', 'Versement déjà en cours');

    const bm = await membership(group.id, cycle.beneficiary_id);
    const ben = await db('users').where({ id: cycle.beneficiary_id }).first();
    let providerName;
    let provider;
    try {
      ({ name: providerName, client: provider } = payments.route(group.country, bm.payout_method, group.currency));
    } catch (e) {
      await db('cycles').where({ id: cycle.id }).update({ status: 'ready', updated_at: db.fn.now() });
      throw e;
    }
    const q = await fees.quotePayout({ grossMinor, currency: group.currency, country: group.country, provider: providerName, method: bm.payout_method });
    const ref = reference('IKP');
    await db('payouts').insert({
      cycle_id: cycle.id, user_id: ben.id, amount_minor: grossMinor, fee_minor: q.feeMinor, currency: group.currency,
      method: bm.payout_method, provider: providerName, phone: bm.payout_phone, reference: ref, request_id: req.id,
    });
    await audit.log({ actorId, action: 'payout.executing', entity: 'payout', entityId: ref, data: { gross: grossMinor, fee: q.feeMinor, net: q.netMinor } });
    const [firstname, ...rest] = (ben.name || 'Membre Ikobi').split(' ');
    const r = await provider.credit({
      amount: fromMinor(q.netMinor), currency: group.currency, phone: bm.payout_phone, method: bm.payout_method,
      reference: ref, firstname, lastname: rest.join(' ') || 'Ikobi', callbackUrl: callbackUrl(providerName),
    });
    if (!r.accepted) {
      await db('payouts').where({ reference: ref }).update({ status: 'failed', failure_reason: r.error, updated_at: db.fn.now() });
      await db('payout_requests').where({ id: req.id }).update({ status: 'failed', updated_at: db.fn.now() });
      await db('cycles').where({ id: cycle.id }).update({ status: 'ready', updated_at: db.fn.now() });
      await audit.log({ actorType: 'provider', action: 'payout.refused', entity: 'payout', entityId: ref, data: { code: r.errorCode } });
      throw badRequest('payout_refused', r.error || 'Versement refusé');
    }
    await db('payouts').where({ reference: ref }).update({ provider_tx_id: r.providerTxId, updated_at: db.fn.now() });
    if (r.confirmationRequired) {
      // AWA demande une confirmation supplémentaire (procédure non publiée) : on n'improvise pas,
      // le versement reste en attente et l'équipe finance est alertée.
      await audit.log({ actorType: 'provider', action: 'payout.confirmation_required', entity: 'payout', entityId: ref });
      const team = await db('users').whereIn('platform_role', ['finance', 'admin']);
      for (const u of team) await notifier.user(u.id, { title: 'Versement à confirmer chez AWA', body: `Référence ${ref}`, data: { payout: ref } });
    }
    if (r.finalStatus && r.finalStatus !== 'pending') await applyPayoutResult(ref, r.finalStatus, r.providerTxId);
    return db('payouts').where({ reference: ref }).first();
  }

  async function applyPayoutResult(ref, status, providerTxId, reason, source = 'callback') {
    if (status === 'pending') return null;
    const p = await db('payouts').where({ reference: ref }).first();
    if (!p || p.status !== 'pending') return p || null;
    const cycle = await db('cycles').where({ id: p.cycle_id }).first();
    const group = await db('groups').where({ id: cycle.group_id }).first();

    const applied = await db.transaction(async (trx) => {
      const changed = await trx('payouts').where({ id: p.id, status: 'pending' }).update({
        status, provider_tx_id: providerTxId || p.provider_tx_id,
        failure_reason: status === 'failed' ? String(reason || 'Versement échoué').slice(0, 200) : null,
        updated_at: trx.fn.now(),
      });
      if (!changed) return false;
      if (status === 'failed') {
        await trx('cycles').where({ id: cycle.id }).update({ status: 'ready', updated_at: trx.fn.now() });
        if (p.request_id) await trx('payout_requests').where({ id: p.request_id }).update({ status: 'failed', updated_at: trx.fn.now() });
      } else {
        const gross = Number(p.amount_minor);
        const fee = Number(p.fee_minor);
        await ledger.post({
          kind: 'payout', refType: 'payout', refId: p.reference, currency: p.currency, memo: `Versement tour ${cycle.number}`,
          lines: [
            { account: `pool:${group.id}`, debit: gross },
            { account: `cash:${p.provider}`, credit: gross - fee },
            ...(fee > 0 ? [{ account: 'revenue:fees', credit: fee }] : []),
          ],
        }, trx);
        if (p.request_id) await trx('payout_requests').where({ id: p.request_id }).update({ status: 'executed', updated_at: trx.fn.now() });
        await trx('cycles').where({ id: cycle.id }).update({ status: 'closed', updated_at: trx.fn.now() });
        const next = await trx('cycles').where({ group_id: group.id, number: cycle.number + 1 }).first();
        if (next) await trx('cycles').where({ id: next.id }).update({ status: 'open', updated_at: trx.fn.now() });
        else await trx('groups').where({ id: group.id }).update({ status: 'completed', updated_at: trx.fn.now() });
      }
      await audit.log({ actorType: 'provider', action: `payout.${status}`, entity: 'payout', entityId: ref, data: { source, providerTxId } }, trx);
      return true;
    });
    if (!applied) return p;

    const net = formatMoney(Number(p.amount_minor) - Number(p.fee_minor), p.currency);
    if (status === 'failed') {
      const admins = await db('memberships').where({ group_id: group.id, role: 'admin' });
      for (const a of admins) {
        await notifier.user(a.user_id, { title: group.name, body: `Le versement de ${net} a échoué. Une nouvelle demande est nécessaire.`, data: { groupId: group.id } });
      }
      return db('payouts').where({ id: p.id }).first();
    }
    await notifier.user(p.user_id, {
      title: '💰 Cagnotte versée',
      body: `${net} ont été envoyés sur ton Mobile Money (« ${group.name} »).`,
      data: { groupId: group.id },
      whatsappText: `💰 *${net}* ont été envoyés sur ton Mobile Money pour *${group.name}*.`,
    });
    const members = await db('memberships').where({ group_id: group.id });
    const next = await db('cycles').where({ group_id: group.id, status: 'open' }).first();
    for (const m of members) {
      if (m.user_id === p.user_id) continue;
      await notifier.user(m.user_id, {
        title: group.name,
        body: next ? `Tour ${cycle.number} terminé. Prochaine échéance : ${formatDateFr(next.due_date)}.` : 'La tontine est terminée.',
        data: { groupId: group.id },
      });
    }
    return db('payouts').where({ id: p.id }).first();
  }

  async function applyProviderResult(ref, status, providerTxId, reason, source) {
    if (String(ref).startsWith('IKP-')) return applyPayoutResult(ref, status, providerTxId, reason, source);
    return applyContributionResult(ref, status, providerTxId, reason, source);
  }

  // ---------------------------------------------------------------------------
  // Règlement et réconciliation (équipe finance)
  // ---------------------------------------------------------------------------

  // Marque comme « réglées » des cotisations figurant sur un relevé du fournisseur.
  // Le total du relevé doit correspondre exactement au total encaissé, sinon rien n'est modifié.
  async function settle(actorId, { provider, references, statementTotal, currency, statementRef }) {
    const actor = await db('users').where({ id: actorId }).first();
    if (!['finance', 'admin'].includes(actor?.platform_role)) throw forbidden('Réservé à l’équipe finance Ikobi');
    const refs = [...new Set(references)].sort();
    const rows = await db('contributions').whereIn('reference', refs);
    const problems = [];
    if (rows.length !== refs.length) problems.push(`${refs.length - rows.length} référence(s) inconnue(s)`);
    for (const r of rows) {
      if (r.status !== 'success') problems.push(`${r.reference} n'est pas collectée`);
      if (r.settlement_status === 'settled') problems.push(`${r.reference} déjà réglée`);
      if (r.provider !== provider) problems.push(`${r.reference} : autre fournisseur`);
      if (r.currency !== currency) problems.push(`${r.reference} : autre devise`);
    }
    const expected = rows.reduce((s, r) => s + Number(r.amount_minor) + Number(r.fee_minor), 0);
    const declared = Math.round(Number(statementTotal) * 100);
    if (expected !== declared) problems.push(`Écart : relevé ${fromMinor(declared)} ≠ encaissé ${fromMinor(expected)}`);
    if (problems.length) {
      await audit.log({ actorId, action: 'settlement.discrepancy', entity: 'settlement', entityId: statementRef || 'n/a', data: { provider, currency, problems } });
      throw conflict('settlement_mismatch', problems.join(' · '));
    }
    const journalRef = statementRef || crypto.createHash('sha256').update(refs.join(',')).digest('hex').slice(0, 40);
    await db.transaction(async (trx) => {
      await trx('contributions').whereIn('reference', refs).andWhere({ settlement_status: 'unsettled' }).update({ settlement_status: 'settled', settled_at: trx.fn.now() });
      await ledger.post({
        kind: 'settlement', refType: 'statement', refId: journalRef, currency, memo: `Règlement ${provider} (${refs.length} opérations)`,
        lines: [{ account: `cash:${provider}`, debit: expected }, { account: `clearing:${provider}`, credit: expected }],
      }, trx);
      await audit.log({ actorId, action: 'settlement.recorded', entity: 'settlement', entityId: journalRef, data: { provider, currency, count: refs.length, total: expected } }, trx);
    });
    return { settled: refs.length, total: fromMinor(expected), currency };
  }

  async function reconciliation() {
    const tb = await ledger.trialBalance();
    const unsettled = await db('contributions').where({ status: 'success', settlement_status: 'unsettled' })
      .select('provider', 'currency').count({ n: '*' }).sum({ principal: 'amount_minor' }).sum({ fee: 'fee_minor' }).groupBy('provider', 'currency');
    const stale = await db('contributions').where({ status: 'pending' }).andWhere('created_at', '<', new Date(Date.now() - 30 * 60 * 1000))
      .select('reference', 'provider', 'amount_minor', 'currency', 'created_at').limit(200);
    const pendingPayouts = await db('payout_requests').where({ status: 'requested' }).count({ n: '*' }).first();
    const failedPayouts = await db('payouts').where({ status: 'failed' }).count({ n: '*' }).first();
    return {
      ledgerBalanced: tb.balanced,
      accounts: tb.accounts.map((a) => ({ ...a, debit: fromMinor(a.debit), credit: fromMinor(a.credit), balance: fromMinor(a.balance) })),
      unsettled: unsettled.map((u) => ({ provider: u.provider, currency: u.currency, count: Number(u.n), total: fromMinor(Number(u.principal) + Number(u.fee)) })),
      stalePending: stale.map((s) => ({ reference: s.reference, provider: s.provider, amount: fromMinor(Number(s.amount_minor)), currency: s.currency, createdAt: s.created_at })),
      payoutRequestsAwaiting: Number(pendingPayouts.n),
      failedPayouts: Number(failedPayouts.n),
    };
  }

  async function payoutQueue() {
    const rows = await db('payout_requests as r')
      .join('cycles as c', 'c.id', 'r.cycle_id')
      .join('groups as g', 'g.id', 'c.group_id')
      .join('users as u', 'u.id', 'c.beneficiary_id')
      .where('r.status', 'requested')
      .select('r.id', 'r.created_at', 'r.requested_by', 'c.number', 'c.id as cycle_id', 'g.id as group_id', 'g.name', 'g.currency', 'u.name as beneficiary');
    const out = [];
    for (const r of rows) {
      const cycle = await db('cycles').where({ id: r.cycle_id }).first();
      const group = await db('groups').where({ id: r.group_id }).first();
      const pre = await payoutPreconditions(cycle, group);
      out.push({ id: r.id, group: r.name, cycle: r.number, beneficiary: r.beneficiary, gross: fromMinor(pre.grossMinor), currency: r.currency, ready: pre.ok, blockers: pre.reasons, requestedAt: r.created_at });
    }
    return out;
  }

  async function contributionStatus(userId, contributionId) {
    const c = await db('contributions').where({ id: contributionId, user_id: userId }).first();
    if (!c) throw notFound('Paiement introuvable');
    // Rattrapage si le callback tarde : on interroge le fournisseur après 20 s.
    if (c.status === 'pending' && Date.now() - toMs(c.created_at) > 20000) {
      const v = await payments.get(c.provider).verify(c.reference).catch(() => ({ status: 'pending' }));
      if (v.status !== 'pending') await applyContributionResult(c.reference, v.status, v.providerTxId, v.description, 'poll');
    }
    const fresh = await db('contributions').where({ id: contributionId }).first();
    return {
      id: fresh.id,
      status: fresh.status,
      amount: fromMinor(Number(fresh.amount_minor)),
      fee: fromMinor(Number(fresh.fee_minor)),
      total: fromMinor(Number(fresh.amount_minor) + Number(fresh.fee_minor)),
      currency: fresh.currency,
      method: fresh.method,
      reference: fresh.reference,
      settlement: fresh.settlement_status,
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
    quoteContribution, initiateContribution, applyContributionResult, applyPayoutResult, applyProviderResult,
    requestPayout, reviewPayout, payoutPreconditions, settle, reconciliation, payoutQueue,
    contributionStatus, history, currentCycle, memberCount, paidUserIds, potMinor,
  };
}
