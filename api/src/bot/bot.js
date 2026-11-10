// Chatbot WhatsApp Ikobi : cotiser, consulter son statut, rejoindre une tontine — en chat.
//
// Commandes (français, avec quelques mots de lingala) :
//   menu | bonjour | mbote          → menu principal
//   cotiser | payer | kofuta        → cotiser (numéro WhatsApp utilisé pour le paiement)
//   cotiser 0812345678              → cotiser avec un autre numéro Mobile Money
//   statut | solde | situation      → où en sont mes tontines
//   rejoindre ABC123                → rejoindre une tontine avec son code
//   aide                            → aide

import { formatMoney, fromMinor } from '../lib/money.js';
import { formatDateFr, today, daysBetween, toMs } from '../lib/dates.js';
import { METHODS, detectMethod, normalizePhone, maskPhone } from '../lib/phone.js';
import { insertId } from '../db.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const GREETINGS = ['menu', 'bonjour', 'bonsoir', 'salut', 'mbote', 'hello', 'hi', 'start', 'debut', 'accueil'];
const PAY_WORDS = ['cotiser', 'cotisation', 'payer', 'paye', 'kofuta', 'futa', 'contribuer'];
const STATUS_WORDS = ['statut', 'status', 'solde', 'situation', 'etat', 'mes tontines'];
const HELP_WORDS = ['aide', 'help', '?', 'lisalisi'];

export function createBot({ db, whatsapp, tontine, config, logger = console }) {
  async function getSession(phone) {
    const s = await db('wa_sessions').where({ phone }).first();
    if (!s) return { state: 'idle', data: {} };
    // Une conversation inactive depuis 30 min repart de zéro.
    if (Date.now() - toMs(s.updated_at) > 30 * 60 * 1000) return { state: 'idle', data: {} };
    return { state: s.state, data: s.data ? JSON.parse(s.data) : {} };
  }

  async function setSession(phone, state, data = {}) {
    const row = { phone, state, data: JSON.stringify(data), updated_at: new Date() };
    const exists = await db('wa_sessions').where({ phone }).first();
    if (exists) await db('wa_sessions').where({ phone }).update(row);
    else await db('wa_sessions').insert(row);
  }

  const appLine = () => (config.appStoreUrl || config.playStoreUrl
    ? `\n\n📱 App Ikobi : ${[config.appStoreUrl, config.playStoreUrl].filter(Boolean).join(' · ')}`
    : '\n\n📱 Télécharge l\'app *Ikobi* sur l\'App Store ou Google Play.');

  async function mainMenu(user) {
    const hello = user.name ? `Mbote ${user.name.split(' ')[0]} 👋` : 'Mbote 👋';
    await whatsapp.sendButtons(
      user.phone,
      `${hello}\nBienvenue sur *Ikobi*, ta tontine en toute sécurité.\n\nQue veux-tu faire ?`,
      [
        { id: 'menu:pay', title: '💸 Cotiser' },
        { id: 'menu:status', title: '📊 Mes tontines' },
        { id: 'menu:help', title: '❓ Aide' },
      ],
    );
  }

  async function help(phone) {
    await whatsapp.sendText(
      phone,
      '*Ikobi — aide*\n\n' +
        '• *cotiser* : payer ta cotisation par Mobile Money\n' +
        '• *cotiser 0812345678* : payer avec un autre numéro\n' +
        '• *statut* : où en sont tes tontines\n' +
        '• *rejoindre CODE* : rejoindre une tontine avec son code d\'invitation\n' +
        '• *menu* : revenir au menu\n\n' +
        'Opérateurs acceptés : M-Pesa, Orange Money, Airtel Money, Afrimoney.\n' +
        'Ikobi ne te demandera JAMAIS ton code PIN par message : tu le saisis uniquement sur l\'écran de ton téléphone quand l\'opérateur te le demande.' +
        appLine(),
    );
  }

  async function status(user) {
    const groups = await tontine.myGroups(user.id);
    if (!groups.length) {
      await whatsapp.sendText(user.phone, "Tu ne fais encore partie d'aucune tontine.\nÉcris *rejoindre CODE* avec le code reçu de ton groupe." + appLine());
      return;
    }
    const lines = [];
    for (const g of groups.slice(0, 8)) {
      const amount = formatMoney(Math.round(g.amount * 100), g.currency);
      if (g.status === 'forming') {
        lines.push(`*${g.name}* — en formation (${g.members}/${g.maxMembers} membres), ${amount} par tour`);
      } else if (g.status === 'completed') {
        lines.push(`*${g.name}* — terminée ✅`);
      } else if (g.currentCycle) {
        const c = g.currentCycle;
        const days = daysBetween(today(), c.dueDate);
        const when = days > 0 ? `dans ${days} j` : days === 0 ? "aujourd'hui" : `en retard de ${-days} j`;
        const me = c.iAmBeneficiary ? '🎁 C\'est ton tour de recevoir !' : c.iHavePaid ? '✅ Tu as payé' : `⏳ À payer : ${amount}`;
        lines.push(`*${g.name}* — tour ${c.number}, échéance ${formatDateFr(c.dueDate)} (${when})\n${c.paidCount}/${c.expectedCount} ont payé · ${me}`);
      }
    }
    const owes = groups.some((g) => g.currentCycle && !g.currentCycle.iAmBeneficiary && !g.currentCycle.iHavePaid);
    const text = `📊 *Tes tontines*\n\n${lines.join('\n\n')}`;
    if (owes) await whatsapp.sendButtons(user.phone, text, [{ id: 'menu:pay', title: '💸 Cotiser' }, { id: 'menu:menu', title: 'Menu' }]);
    else await whatsapp.sendText(user.phone, text);
  }

  async function startPay(user, otherPhone) {
    let payPhone = user.phone;
    if (otherPhone) {
      payPhone = normalizePhone(otherPhone);
      if (!payPhone) {
        await whatsapp.sendText(user.phone, 'Numéro invalide. Exemple : *cotiser 0812345678*');
        return;
      }
    }
    const dues = await tontine.duesForUser(user.id);
    if (!dues.length) {
      await whatsapp.sendText(user.phone, '✅ Tu es à jour : aucune cotisation à payer pour le moment.');
      await setSession(user.phone, 'idle');
      return;
    }
    if (dues.length === 1) return confirmPay(user, dues[0].group_id, payPhone);
    await setSession(user.phone, 'choose_group', { payPhone });
    await whatsapp.sendList(
      user.phone,
      'Pour quelle tontine veux-tu cotiser ?',
      'Choisir',
      dues.map((d) => ({
        id: `pay:group:${d.group_id}`,
        title: d.name,
        description: `${formatMoney(Number(d.amount_minor), d.currency)} · tour ${d.number} · avant le ${formatDateFr(d.due_date)}`,
      })),
      'Tontines',
    );
  }

  async function confirmPay(user, groupId, payPhone) {
    const dues = await tontine.duesForUser(user.id);
    const d = dues.find((x) => x.group_id === Number(groupId));
    if (!d) {
      await whatsapp.sendText(user.phone, '✅ Rien à payer pour cette tontine.');
      await setSession(user.phone, 'idle');
      return;
    }
    const method = detectMethod(payPhone);
    await setSession(user.phone, 'confirm_pay', { groupId: d.group_id, payPhone });
    const amount = formatMoney(Number(d.amount_minor), d.currency);
    const text = `💸 *Cotisation ${d.name}*\nTour ${d.number} · échéance ${formatDateFr(d.due_date)}\n\nMontant : *${amount}*\nNuméro : ${maskPhone(payPhone)}\n\nTu vas recevoir une demande de paiement sur ton téléphone.`;
    const buttons = method
      ? [{ id: `pay:go:${method}`, title: `Payer · ${METHODS[method]}`.slice(0, 20) }, { id: 'pay:methods', title: 'Autre opérateur' }, { id: 'pay:cancel', title: 'Annuler' }]
      : [{ id: 'pay:methods', title: 'Choisir opérateur' }, { id: 'pay:cancel', title: 'Annuler' }];
    await whatsapp.sendButtons(user.phone, text, buttons);
  }

  async function chooseMethod(user) {
    await whatsapp.sendList(
      user.phone,
      'Avec quel opérateur veux-tu payer ?',
      'Opérateurs',
      Object.entries(METHODS).map(([id, title]) => ({ id: `pay:go:${id}`, title })),
      'Mobile Money',
    );
  }

  async function executePay(user, method, session) {
    const { groupId, payPhone } = session.data || {};
    if (!groupId) return startPay(user);
    await setSession(user.phone, 'idle');
    try {
      const { contribution, reused } = await tontine.initiateContribution(user.id, groupId, { phone: payPhone, method, channel: 'whatsapp' });
      if (reused) {
        await whatsapp.sendText(user.phone, '⏳ Un paiement est déjà en cours. Vérifie ton téléphone et saisis ton code PIN pour valider.');
        return;
      }
      if (contribution.status === 'success') return; // la confirmation est envoyée par le service
      await whatsapp.sendText(
        user.phone,
        `📲 Demande de paiement envoyée sur ton *${METHODS[contribution.method]}* (${maskPhone(contribution.phone)}).\n\n` +
          'Valide avec ton code PIN *sur l\'écran de ton téléphone*. Je te confirme ici dès que c\'est reçu.\n\n' +
          '🔒 Ne partage jamais ton code PIN, même avec Ikobi.',
      );
    } catch (e) {
      await whatsapp.sendText(user.phone, `❌ ${e.message || 'Le paiement n\'a pas pu être lancé.'}`);
    }
  }

  async function join(user, waName, code) {
    if (!code) {
      await whatsapp.sendText(user?.phone, 'Écris *rejoindre* suivi du code de la tontine. Exemple : *rejoindre K7PQ2M*');
      return;
    }
    try {
      const groupId = await tontine.joinGroup(user.id, { code, payoutPhone: user.phone });
      const g = await db('groups').where({ id: groupId }).first();
      const n = await tontine.memberCount(groupId);
      await whatsapp.sendText(
        user.phone,
        `🎉 Bienvenue dans *${g.name}* !\n${formatMoney(Number(g.amount_minor), g.currency)} par tour · ${n}/${g.max_members} membres.\n\n` +
          `Ta cagnotte sera versée sur ce numéro WhatsApp (${METHODS[detectMethod(user.phone)] || 'Mobile Money'}). Tu peux le changer dans l'app.\n\n` +
          "Je te préviens dès que la tontine démarre.",
      );
    } catch (e) {
      await whatsapp.sendText(user.phone, `❌ ${e.message}`);
    }
  }

  async function findOrCreateUser(phone, waName, allowCreate) {
    let user = await db('users').where({ phone }).first();
    if (!user && allowCreate) {
      const id = await insertId(db('users').insert({ phone, name: (waName || '').slice(0, 80) }, ['id']));
      user = await db('users').where({ id }).first();
    }
    return user;
  }

  // Point d'entrée : un message entrant normalisé.
  async function handle({ from, waName, text, replyId }) {
    const phone = normalizePhone(from) || from;
    const t = norm(text);
    const joinMatch = /^(rejoindre|join|kokota)\s+([a-z0-9]{4,8})$/i.exec(t);

    const user = await findOrCreateUser(phone, waName, Boolean(joinMatch));
    if (!user) {
      await whatsapp.sendText(
        phone,
        "Mbote 👋 Je suis l'assistant *Ikobi*, l'app de tontine (likelemba) sécurisée.\n\n" +
          "Tu n'as pas encore de compte. Pour rejoindre une tontine, écris *rejoindre* suivi du code reçu de ton groupe.\nExemple : *rejoindre K7PQ2M*" +
          appLine(),
      );
      return;
    }
    await db('users').where({ id: user.id }).update({ wa_last_inbound_at: new Date(), ...(user.name ? {} : waName ? { name: waName.slice(0, 80) } : {}) });
    user.wa_last_inbound_at = new Date();

    if (joinMatch) return join(user, waName, joinMatch[2].toUpperCase());

    const session = await getSession(phone);

    if (replyId) {
      if (replyId === 'menu:pay') return startPay(user);
      if (replyId === 'menu:status') return status(user);
      if (replyId === 'menu:help') return help(phone);
      if (replyId === 'menu:menu') return mainMenu(user);
      if (replyId.startsWith('pay:group:')) return confirmPay(user, Number(replyId.slice(10)), session.data?.payPhone || phone);
      if (replyId === 'pay:methods') return chooseMethod(user);
      if (replyId.startsWith('pay:go:')) {
        const method = replyId.slice(7);
        if (!METHODS[method]) return mainMenu(user);
        if (session.state !== 'confirm_pay') {
          await whatsapp.sendText(phone, 'Cette demande a expiré. Écris *cotiser* pour recommencer.');
          return;
        }
        return executePay(user, method, session);
      }
      if (replyId === 'pay:cancel') {
        await setSession(phone, 'idle');
        await whatsapp.sendText(phone, "D'accord, paiement annulé. Écris *menu* quand tu veux.");
        return;
      }
    }

    const payMatch = /^(cotiser|payer|kofuta)\s+([+\d\s]{9,16})$/.exec(t);
    if (payMatch) return startPay(user, payMatch[2]);
    if (PAY_WORDS.some((w) => t === w || t.startsWith(w + ' '))) return startPay(user);
    if (STATUS_WORDS.some((w) => t === w || t.startsWith(w))) return status(user);
    if (HELP_WORDS.includes(t)) return help(phone);
    if (/^(rejoindre|join)$/.test(t)) return join(user, waName, null);
    if (/\b(pin|mot de passe|code secret)\b/.test(t) && /\d{4,}/.test(t)) {
      await whatsapp.sendText(phone, '🔒 Ne partage jamais ton code PIN par message, même avec Ikobi. Saisis-le uniquement sur l\'écran de ton téléphone quand ton opérateur le demande.');
      return;
    }
    return mainMenu(user);
  }

  // Extrait les messages du webhook Meta et les traite un par un.
  async function handleWebhook(body) {
    const entries = body?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
        for (const m of v.messages || []) {
          // déduplication : Meta peut renvoyer le même message
          try {
            await db('wa_inbound').insert({ message_id: m.id });
          } catch {
            continue;
          }
          const replyId = m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || m.button?.payload || null;
          const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || '';
          if (!['text', 'interactive', 'button'].includes(m.type)) {
            await whatsapp.sendText(m.from, 'Je comprends seulement les messages texte pour l\'instant. Écris *menu*.');
            continue;
          }
          try {
            await handle({ from: m.from, waName: names[m.from], text, replyId });
          } catch (e) {
            logger.error?.({ err: e.message, from: m.from }, 'Erreur du bot WhatsApp');
            await whatsapp.sendText(m.from, '😕 Un souci technique est survenu. Réessaie dans un instant ou écris *menu*.');
          }
        }
      }
    }
  }

  return { handle, handleWebhook };
}
