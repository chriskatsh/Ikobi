import pino from 'pino';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { migrate } from './migrations/index.js';
import { createApp } from './app.js';
import { createMokoClient, createMockMoko } from './services/moko.js';
import { createWhatsAppClient } from './services/whatsapp.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

async function main() {
  const config = loadConfig();
  config.appStoreUrl = process.env.APP_STORE_URL || '';
  config.playStoreUrl = process.env.PLAY_STORE_URL || '';

  const db = createDb(config.db);
  await migrate(db);

  // Sans identifiants MOKO (développement), un faux agrégateur est utilisé : aucun argent ne circule.
  const moko = config.moko.merchantId ? createMokoClient(config.moko, { logger }) : createMockMoko();
  if (moko.isMock) logger.warn('MOKO non configuré : mode simulation (aucun paiement réel)');
  const whatsapp = createWhatsAppClient(config.whatsapp, { logger });

  const { app, services } = createApp({ db, config, moko, whatsapp, logger });
  if (config.remindersEnabled) services.reminders.start();

  app.listen(config.port, () => logger.info({ port: config.port }, 'Ikobi API démarrée'));
}

main().catch((e) => {
  logger.fatal({ err: e.message }, 'Démarrage impossible');
  process.exit(1);
});
