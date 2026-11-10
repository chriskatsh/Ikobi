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
import { createDeveloperService } from './services/developers.js';
import { developerPublicRoutes, partnerRoutes } from './routes/developers.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Pages du portail (HTML/CSS/JS statiques). CSP stricte : aucun script en ligne.
function portal(app) {
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h', index: 'index.html' }));
}

function securityHeaders(app) {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
}

function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'bad_json', message: 'JSON invalide' } });
    }
    logger.error?.({ err: err?.message, stack: err?.stack }, 'Erreur serveur');
    return res.status(500).json({ error: { code: 'server_error', message: 'Erreur interne. Réessayez dans un instant.' } });
  };
}

const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

// Mode « configuration incomplète » : portail et demandes de clé actifs, paiements fermés.
export function createSetupApp({ db, config, logger = console }) {
  const app = express();
  securityHeaders(app);
  app.use(cors());
  app.use(express.json({ limit: '50kb' }));
  portal(app);
  app.use(noStore);
  const unavailable = (_req, res) => res.status(503).json({ ok: false, status: 'configuration_incomplete', message: 'Service en cours de configuration' });
  app.get('/v1/health', (_req, res) => res.status(503).json({ ok: false, status: 'configuration_incomplete', missing: config.missing }));
  if (db) {
    const audit = createAudit({ db });
    const developers = createDeveloperService({ db, audit, config });
    app.use('/v1', developerPublicRoutes({ developers }));
  }
  app.use(['/v1', '/webhooks', '/partner'], unavailable);
  app.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Route introuvable' } }));
  app.use(errorHandler(logger));
  return app;
}
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
  const developers = createDeveloperService({ db, audit, config });
  return { payments, ledger, audit, fees, notifier, auth, tontine, bot, reminders, developers };
}

export function createApp({ db, config, providers, whatsapp, services, logger = console }) {
  const s = services || buildServices({ db, config, providers, whatsapp, logger });
  const app = express();
  securityHeaders(app);
  app.use(cors());
  // Le corps brut est conservé pour vérifier les signatures (Meta, AWA).
  app.use(express.json({ limit: '200kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
  portal(app);
  // Données personnelles et statuts de paiement : jamais en cache (CDN Hostinger compris).
  app.use(noStore);

  app.use('/webhooks', webhookRoutes({ db, payments: s.payments, tontine: s.tontine, audit: s.audit, bot: s.bot, config, logger }));
  app.use('/partner/v1', partnerRoutes({ developers: s.developers }));
  app.use('/v1/ops', opsRoutes({ auth: s.auth, tontine: s.tontine, audit: s.audit, developers: s.developers, db }));
  app.use('/v1', developerPublicRoutes({ developers: s.developers }));
  app.use('/v1', apiRoutes({ auth: s.auth, tontine: s.tontine, payments: s.payments, db, config }));

  app.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Route introuvable' } }));
  app.use(errorHandler(logger));

  return { app, services: s };
}
