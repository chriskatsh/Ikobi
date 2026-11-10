import { Router } from 'express';
import { verifyMetaSignature } from '../services/whatsapp.js';
import { mapTransStatus } from '../services/moko.js';

export function webhookRoutes({ moko, tontine, bot, config, logger = console }) {
  const r = Router();

  // --- MOKO Afrika : statut final des paiements et versements
  r.post('/moko', async (req, res) => {
    let payload;
    try {
      payload = moko.parseCallback(req.rawBody?.toString('utf8') || JSON.stringify(req.body || {}), req.get('X-Signature'));
    } catch (e) {
      logger.warn?.({ err: e.message }, 'Callback MOKO rejeté');
      return res.status(e.status || 400).json({ status: 'error', message: e.message });
    }
    const reference = payload.Reference || payload.reference;
    if (!reference) return res.status(400).json({ status: 'error', message: 'Référence manquante' });
    try {
      // Défense en profondeur : on reconfirme le statut auprès de MOKO avant de créditer.
      let status = mapTransStatus(payload.Trans_Status);
      let providerTxId = payload.PayDRC_Reference || payload.Transaction_id || null;
      if (status === 'success' && !moko.isMock) {
        const v = await moko.verify(reference);
        if (v.status !== 'success') status = v.status;
        providerTxId = v.providerTxId || providerTxId;
      }
      await tontine.applyProviderResult(reference, status, providerTxId, payload.Trans_Status_Description || payload.Comment);
      res.json({ status: 'success', data: { reference } });
    } catch (e) {
      logger.error?.({ err: e.message, reference }, 'Erreur de traitement du callback MOKO');
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
    // Répondre vite à Meta (sinon il renvoie le message), traiter ensuite.
    res.sendStatus(200);
    bot.handleWebhook(req.body).catch((e) => logger.error?.({ err: e.message }, 'Erreur webhook WhatsApp'));
  });

  return r;
}
