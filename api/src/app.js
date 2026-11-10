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
import { webhookRoutes } from './routes/webhooks.js';

export function buildServices({ db, config, moko, whatsapp, fetchImpl, logger = console }) {
  const notifier = createNotifier({ db, whatsapp, fetchImpl, logger });
  const auth = createAuthService({ db, whatsapp, config });
  const tontine = createTontineService({ db, moko, notifier, config, logger });
  const bot = createBot({ db, whatsapp, tontine, config, logger });
  const reminders = createReminderJob({ db, whatsapp, notifier, tontine, config, logger });
  return { notifier, auth, tontine, bot, reminders };
}

export function createApp({ db, config, moko, whatsapp, services, logger = console }) {
  const s = services || buildServices({ db, config, moko, whatsapp, logger });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors());
  // Le corps brut est conservé pour vérifier les signatures (Meta, MOKO).
  app.use(express.json({ limit: '200kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

  app.use('/webhooks', webhookRoutes({ moko, tontine: s.tontine, bot: s.bot, config, logger }));
  app.use('/v1', apiRoutes({ auth: s.auth, tontine: s.tontine, db, config }));
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
