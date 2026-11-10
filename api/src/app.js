import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { HttpError } from './lib/errors.js';
import { createAuthService } from './services/auth.js';
import { createTontineService } from './services/tontine.js';
import { createNotifier } from './services/notify.js';
import { createBot } from './bot/bot.js';
import { createReminderJob } from './jobs/reminders.js';
import { apiRoutes } from './routes/api.js';
import { opsRoutes } from './routes/ops.js';
import { createLedger } from './services/ledger.js';
import { createAudit } from './services/audit.js';
import { createFeeEngine } from './services/fees.js';
import { createPaymentOrchestrator } from './services/payments.js';
import { webhookRoutes } from './routes/webhooks.js';

export function buildServices({ db, config, providers, whatsapp, fetchImpl, logger = console }) {
  const payments = createPaymentOrchestrator({ providers });
  const ledger = createLedger({ db });
  const audit = createAudit({ db });
  const fees = createFeeEngine({ db });
  const notifier = createNotifier({ db, whatsapp, fetchImpl, logger });
  const auth = createAuthService({ db, whatsapp, config, audit });
  const tontine = createTontineService({ db, payments, ledger, fees, audit, notifier, config, logger });
  const bot = createBot({ db, whatsapp, tontine, config, logger });
  const reminders = createReminderJob({ db, whatsapp, notifier, tontine, config, logger });
  return { payments, ledger, audit, fees, notifier, auth, tontine, bot, reminders };
}

export function createApp({ db, config, providers, whatsapp, services, logger = console }) {
  const s = services || buildServices({ db, config, providers, whatsapp, logger });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  // Données personnelles et statuts de paiement : jamais en cache (CDN Hostinger compris).
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(cors());
  // Le corps brut est conservé pour vérifier les signatures (Meta, AWA).
  app.use(express.json({ limit: '200kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

  app.use('/webhooks', webhookRoutes({ db, payments: s.payments, tontine: s.tontine, audit: s.audit, bot: s.bot, config, logger }));
  app.use('/v1/ops', opsRoutes({ auth: s.auth, tontine: s.tontine, audit: s.audit, db }));
  app.use('/v1', apiRoutes({ auth: s.auth, tontine: s.tontine, payments: s.payments, db, config }));
  app.get('/', (_req, res) => res.json({ service: 'Ikobi API', docs: '/v1/health' }));

  app.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Route introuvable' } }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'bad_json', message: 'JSON invalide' } });
    }
    logger.error?.({ err: err?.message, stack: err?.stack }, 'Erreur serveur');
    return res.status(500).json({ error: { code: 'server_error', message: 'Erreur interne. Réessaie dans un instant.' } });
  });

  return { app, services: s };
}
