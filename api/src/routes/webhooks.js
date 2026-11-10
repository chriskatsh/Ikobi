import crypto from 'node:crypto';
import { Router } from 'express';
import { verifyMetaSignature } from '../services/whatsapp.js';

export function webhookRoutes({ db, payments, tontine, audit, bot, config, logger = console }) {
  const r = Router();

  async function recordEvent(row) {
    try {
      await db('provider_events').insert(row);
      return true;
    } catch {
      return false; // même événement déjà reçu (rejeu)
    }
  }

  // --- Fournisseurs de paiement (/webhooks/awa ; d'autres fournisseurs plus tard)
  r.post('/:provider', async (req, res, next) => {
    const name = req.params.provider;
    if (name === 'whatsapp') return next();
    const provider = payments.providers[name];
    if (!provider) return res.status(404).json({ status: 'error', message: 'Fournisseur inconnu' });

    const raw = req.rawBody?.toString('utf8') || JSON.stringify(req.body || {});
    const eventHash = crypto.createHash('sha256').update(`${name}:${req.get('X-Signature') || ''}:${raw}`).digest('hex');
    const seen = await db('provider_events').where({ event_hash: eventHash }).first();
    if (seen) return res.json({ status: 'success', duplicate: true });

    let payload;
    try {
      payload = provider.parseCallback(raw, req.get('X-Signature'));
    } catch (e) {
      await recordEvent({ provider: name, event_hash: eventHash, outcome: 'rejected', status_reported: null, reference: null });
      logger.warn?.({ err: e.message, provider: name }, 'Callback paiement rejeté');
      return res.status(e.status || 400).json({ status: 'error', message: e.message });
    }
    const { reference } = payload;
    if (!reference) return res.status(400).json({ status: 'error', message: 'Référence manquante' });
    try {
      const known = String(reference).startsWith('IKP-')
        ? await db('payouts').where({ reference }).first()
        : await db('contributions').where({ reference }).first();
      if (!known) {
        await recordEvent({ provider: name, reference, event_hash: eventHash, status_reported: payload.status, outcome: 'unknown_reference' });
        return res.json({ status: 'success' });
      }
      // Le montant annoncé doit correspondre exactement à ce qui a été demandé.
      if (payload.amount !== undefined && payload.amount !== null && payload.amount !== '') {
        const expected = String(reference).startsWith('IKP-')
          ? (Number(known.amount_minor) - Number(known.fee_minor)) / 100
          : (Number(known.amount_minor) + Number(known.fee_minor)) / 100;
        if (Math.round(Number(payload.amount) * 100) !== Math.round(expected * 100)) {
          await recordEvent({ provider: name, reference, event_hash: eventHash, status_reported: payload.status, outcome: 'amount_mismatch' });
          await audit.log({ actorType: 'provider', action: 'callback.amount_mismatch', entity: 'transaction', entityId: reference, data: { announced: payload.amount, expected } });
          logger.error?.({ reference, announced: payload.amount, expected }, 'Montant du callback différent du montant attendu');
          return res.json({ status: 'success' }); // accusé de réception, mais rien n'est appliqué : revue humaine
        }
      }
      // Défense en profondeur : un succès annoncé est reconfirmé auprès du fournisseur (/status) avant tout crédit.
      let { status, providerTxId } = payload;
      if (status === 'success' && !provider.isMock) {
        const v = await provider.verify(reference);
        if (v.status !== 'success') status = v.status;
        providerTxId = v.providerTxId || providerTxId;
      }
      await recordEvent({ provider: name, reference, event_hash: eventHash, status_reported: String(payload.status), outcome: 'applied' });
      await tontine.applyProviderResult(reference, status, providerTxId, payload.description, 'callback');
      res.json({ status: 'success' });
    } catch (e) {
      logger.error?.({ err: e.message, reference }, 'Erreur de traitement du callback paiement');
      res.status(500).json({ status: 'error' });
    }
  });

  // --- WhatsApp Cloud API : vérification de l'URL du webhook
  r.get('/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    if (mode === 'subscribe' && token && token === config.whatsapp.verifyToken) {
      return res.status(200).send(String(req.query['hub.challenge'] || ''));
    }
    return res.sendStatus(403);
  });

  // --- WhatsApp Cloud API : messages entrants
  r.post('/whatsapp', (req, res) => {
    if (!verifyMetaSignature(req.rawBody || Buffer.from(''), req.get('X-Hub-Signature-256'), config.whatsapp.appSecret)) {
      return res.sendStatus(401);
    }
    res.sendStatus(200);
    bot.handleWebhook(req.body).catch((e) => logger.error?.({ err: e.message }, 'Erreur webhook WhatsApp'));
  });

  return r;
}
