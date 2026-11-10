import express from 'express';
import pino from 'pino';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { migrate } from './migrations/index.js';
import { createApp } from './app.js';
import { createMokoClient, createMockMoko } from './services/moko.js';
import { createWhatsAppClient } from './services/whatsapp.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Si des variables obligatoires manquent en production, l'API démarre quand même
// mais répond 503 en listant les NOMS des variables à ajouter (jamais leurs valeurs).
function startSetupMode(message) {
  const app = express();
  const missing = message.replace(/^.*: /, '').split(', ');
  app.use((_req, res) => res.status(503).json({ ok: false, status: 'configuration_incomplete', missing }));
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => logger.error({ missing }, 'Configuration incomplète : API en attente des variables'));
}

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (String(e.message).startsWith("Variables d'environnement manquantes")) return startSetupMode(e.message);
    throw e;
  }
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
