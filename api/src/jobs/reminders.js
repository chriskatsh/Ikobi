// Rappels de cotisation : 2 jours avant, le jour J, puis 2 jours après l'échéance.
// Hors fenêtre de 24 h, WhatsApp exige un modèle approuvé (WA_REMINDER_TEMPLATE) :
//   « Bonjour {{1}}, ta cotisation de {{2}} pour {{3}} est attendue {{4}}. Écris *cotiser* pour payer. »

import { daysBetween, formatDateFr, today } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';

export function createReminderJob({ db, whatsapp, notifier, tontine, config, logger = console }) {
  async function runOnce(now = new Date()) {
    const day = today(now);
    const cycles = await db('cycles as c')
      .join('groups as g', 'g.id', 'c.group_id')
      .where('c.status', 'open')
      .andWhere('g.status', 'active')
      .select('c.id', 'c.number', 'c.due_date', 'c.beneficiary_id', 'g.id as group_id', 'g.name', 'g.amount_minor', 'g.currency');

    let sent = 0;
    for (const c of cycles) {
      const d = daysBetween(day, c.due_date);
      const kind = d === 2 ? 'before' : d === 0 ? 'due' : d === -2 ? 'late' : null;
      if (!kind) continue;
      const paid = await tontine.paidUserIds(c.id);
      const members = await db('memberships as m').join('users as u', 'u.id', 'm.user_id').where('m.group_id', c.group_id).select('u.*');
      for (const u of members) {
        if (u.id === c.beneficiary_id || paid.has(u.id)) continue;
        try {
          await db('reminders').insert({ cycle_id: c.id, user_id: u.id, kind });
        } catch {
          continue; // déjà envoyé
        }
        const amount = formatMoney(Number(c.amount_minor), c.currency);
        const when = kind === 'before' ? `le ${formatDateFr(c.due_date)}` : kind === 'due' ? "aujourd'hui" : `depuis le ${formatDateFr(c.due_date)}`;
        const first = (u.name || 'membre').split(' ')[0];
        await notifier.push(u, c.name, kind === 'late' ? `Cotisation en retard : ${amount}` : `Cotisation de ${amount} attendue ${when}`, { groupId: c.group_id });
        if (notifier.inWaWindow(u)) {
          await whatsapp.sendButtons(u.phone, `⏰ Bonjour ${first}, ta cotisation de *${amount}* pour *${c.name}* est attendue ${when}.`, [{ id: 'menu:pay', title: '💸 Cotiser' }]);
        } else {
          await whatsapp.sendTemplate(u.phone, config.whatsapp.reminderTemplate, [first, amount, c.name, when]);
        }
        sent++;
      }
    }
    if (sent) logger.info?.({ sent }, 'Rappels envoyés');
    return sent;
  }

  let timer = null;
  return {
    runOnce,
    start() {
      if (timer) return;
      // Vérification toutes les heures ; les doublons sont bloqués par la table reminders.
      // Envoi uniquement entre 8 h et 20 h (heure de Kinshasa).
      const tick = async () => {
        const h = (new Date().getUTCHours() + 1) % 24;
        if (h < 8 || h >= 20) return;
        await runOnce().catch((e) => logger.error?.({ err: e.message }, 'Échec des rappels'));
      };
      timer = setInterval(tick, 60 * 60 * 1000);
      setTimeout(tick, 30 * 1000);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
