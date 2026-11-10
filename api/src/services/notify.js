// Notifications : push mobile (Expo) + WhatsApp.
import { toMs } from '../lib/dates.js';
// Le texte libre WhatsApp n'est envoyé que si le membre a écrit au bot dans les dernières 24 h
// (règle Meta). Sinon, seul le push est envoyé (les rappels passent par un modèle approuvé).

const DAY = 24 * 60 * 60 * 1000;

export function createNotifier({ db, whatsapp, fetchImpl = globalThis.fetch, logger = console }) {
  async function push(user, title, body, data = {}) {
    if (!user.push_token || !/^Expo(nent)?PushToken\[/.test(user.push_token)) return;
    try {
      await fetchImpl('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: user.push_token, title, body, data, sound: 'default' }),
      });
    } catch (e) {
      logger.warn?.({ err: e.message }, 'Échec push Expo');
    }
  }

  function inWaWindow(user) {
    if (!user.wa_last_inbound_at) return false;
    return Date.now() - toMs(user.wa_last_inbound_at) < DAY - 5 * 60 * 1000;
  }

  return {
    push,
    inWaWindow,
    async user(userId, { title, body, data, whatsappText }) {
      const user = await db('users').where({ id: userId }).first();
      if (!user) return;
      await push(user, title, body, data);
      if (whatsappText && inWaWindow(user)) await whatsapp.sendText(user.phone, whatsappText);
    },
  };
}
