import pino from 'pino';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { migrate } from './migrations/index.js';
import { createApp, createSetupApp } from './app.js';
import { createAwaClient } from './services/awa.js';
import { createMockProvider } from './services/mock-provider.js';
import { createWhatsAppClient } from './services/whatsapp.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

async function main() {
  // En production, si des clés manquent, l'API démarre en « configuration incomplète » :
  // le portail développeurs et les demandes de clé fonctionnent, les paiements répondent 503.
  const config = loadConfig({ allowIncomplete: true });
  config.appStoreUrl = process.env.APP_STORE_URL || '';
  config.playStoreUrl = process.env.PLAY_STORE_URL || '';

  const dbConfigured = config.db.client === 'better-sqlite3' || Boolean(config.db.connection.database);
  const db = dbConfigured ? createDb(config.db) : null;
  if (db) await migrate(db);

  if (config.isProd && config.missing?.length) {
    const app = createSetupApp({ db, config, logger });
    app.listen(config.port, () => logger.error({ missing: config.missing }, 'Configuration incomplète : paiements désactivés'));
    return;
  }

  // Sans identifiants AWA (développement uniquement), un faux fournisseur est utilisé : aucun argent ne circule.
  // En production, la configuration exige les clés AWA : la simulation y est impossible.
  const awa = config.awa.merchantId ? createAwaClient(config.awa, { logger }) : null;
  const providers = awa ? { awa } : { awa: createMockProvider() };
  if (!awa) logger.warn('AWA non configuré : mode simulation (aucun paiement réel)');
  const whatsapp = createWhatsAppClient(config.whatsapp, { logger });

  const { app, services } = createApp({ db, config, providers, whatsapp, logger });
  if (config.remindersEnabled) services.reminders.start();

  app.listen(config.port, () => logger.info({ port: config.port }, 'Ikobi API démarrée'));
}

main().catch((e) => {
  logger.fatal({ err: e.message }, 'Démarrage impossible');
  process.exit(1);
});
