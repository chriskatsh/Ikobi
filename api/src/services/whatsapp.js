// Client WhatsApp Business Cloud API (Meta).
// Textes libres et messages interactifs : uniquement dans la fenêtre de 24 h
// après le dernier message du membre. Au-delà : modèles (templates) approuvés par Meta.

import crypto from 'node:crypto';

export function verifyMetaSignature(rawBody, header, appSecret) {
  if (!appSecret) return true; // dev uniquement (config refuse l'absence en production)
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function createWhatsAppClient(cfg, { fetchImpl = globalThis.fetch, logger = console } = {}) {
  const url = `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`;

  async function send(to, payload) {
    if (!cfg.accessToken || !cfg.phoneNumberId) {
      logger.info?.({ to, payload }, '[WhatsApp désactivé] message non envoyé');
      return { skipped: true };
    }
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn?.({ to, status: res.status, error: body?.error?.message }, 'Échec envoi WhatsApp');
      return { ok: false, error: body?.error };
    }
    return { ok: true, id: body?.messages?.[0]?.id };
  }

  return {
    sendText: (to, text) => send(to, { type: 'text', text: { body: text, preview_url: false } }),

    // 1 à 3 boutons : [{ id, title (≤ 20 car.) }]
    sendButtons: (to, text, buttons, header) =>
      send(to, {
        type: 'interactive',
        interactive: {
          type: 'button',
          ...(header ? { header: { type: 'text', text: clip(header, 60) } } : {}),
          body: { text: clip(text, 1024) },
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: clip(b.title, 20) } })),
          },
        },
      }),

    // Liste : rows [{ id, title (≤ 24), description (≤ 72) }], 10 lignes max
    sendList: (to, text, buttonLabel, rows, sectionTitle = 'Choisir') =>
      send(to, {
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: clip(text, 1024) },
          action: {
            button: clip(buttonLabel, 20),
            sections: [{
              title: clip(sectionTitle, 24),
              rows: rows.slice(0, 10).map((r) => ({
                id: r.id,
                title: clip(r.title, 24),
                ...(r.description ? { description: clip(r.description, 72) } : {}),
              })),
            }],
          },
        },
      }),

    sendTemplate: (to, name, params = [], { buttonParam } = {}) =>
      send(to, {
        type: 'template',
        template: {
          name,
          language: { code: cfg.templateLang },
          components: [
            ...(params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }] : []),
            // Modèles d'authentification : le code est aussi passé au bouton « Copier le code »
            ...(buttonParam ? [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(buttonParam) }] }] : []),
          ],
        },
      }),

    markRead: (messageId) =>
      cfg.accessToken ? send(undefined, { status: 'read', message_id: messageId }).catch(() => {}) : Promise.resolve(),
  };
}

// Faux client pour les tests : enregistre les messages au lieu de les envoyer.
export function createMockWhatsApp() {
  const sent = [];
  const rec = (type) => async (to, ...args) => {
    sent.push({ type, to, args });
    return { ok: true };
  };
  return {
    sent,
    sendText: rec('text'),
    sendButtons: rec('buttons'),
    sendList: rec('list'),
    sendTemplate: rec('template'),
    markRead: async () => {},
    last(to) {
      return [...sent].reverse().find((m) => m.to === to);
    },
    clear() {
      sent.length = 0;
    },
  };
}
