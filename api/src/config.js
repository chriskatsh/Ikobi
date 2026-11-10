// Configuration centralisée, lue depuis les variables d'environnement.
// Aucune valeur secrète n'a de valeur par défaut en production.

const env = process.env;

function bool(v, def = false) {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

export function loadConfig(overrides = {}) {
  const isProd = (overrides.nodeEnv ?? env.NODE_ENV) === 'production';
  const cfg = {
    nodeEnv: env.NODE_ENV || 'development',
    isProd,
    port: Number(env.PORT || 3000),
    publicUrl: env.PUBLIC_URL || 'http://localhost:3000',
    jwtSecret: env.JWT_SECRET || (isProd ? '' : 'dev-secret-change-me'),
    otpSecret: env.OTP_SECRET || (isProd ? '' : 'dev-otp-secret'),
    // En développement, le code OTP est renvoyé dans la réponse pour faciliter les tests.
    otpDebug: bool(env.OTP_DEBUG, !isProd),

    db: {
      client: env.DB_CLIENT || 'mysql2',
      connection: env.DB_CLIENT === 'better-sqlite3'
        ? { filename: env.DB_FILE || './ikobi.sqlite' }
        : {
            host: env.DB_HOST || '127.0.0.1',
            port: Number(env.DB_PORT || 3306),
            user: env.DB_USER,
            password: env.DB_PASSWORD,
            database: env.DB_NAME,
            charset: 'utf8mb4',
          },
    },

    awa: {
      baseUrl: env.AWA_BASE_URL || 'https://api.awanetwork.tech',
      publicId: env.AWA_PUBLIC_ID || '',
      merchantId: env.AWA_MERCHANT_ID || '',
      secretKey: env.AWA_SECRET_KEY || '',
      // Surcharge des identifiants opérateurs, ex. {"mpesa":2071,"orange":2013,"airtel":2014,"africell":2015}
      providerIds: env.AWA_PROVIDER_IDS ? JSON.parse(env.AWA_PROVIDER_IDS) : undefined,
      // Simulateur AWA (opérateur 14) : tests uniquement, refusé en production.
      simulator: bool(env.AWA_SIMULATOR, false),
    },

    whatsapp: {
      graphVersion: env.WA_GRAPH_VERSION || 'v21.0',
      phoneNumberId: env.WA_PHONE_NUMBER_ID || '',
      accessToken: env.WA_ACCESS_TOKEN || '',
      appSecret: env.WA_APP_SECRET || '',
      verifyToken: env.WA_VERIFY_TOKEN || (isProd ? '' : 'dev-verify-token'),
      otpTemplate: env.WA_OTP_TEMPLATE || 'ikobi_code',
      reminderTemplate: env.WA_REMINDER_TEMPLATE || 'ikobi_rappel',
      templateLang: env.WA_TEMPLATE_LANG || 'fr',
      botNumberDisplay: env.WA_BOT_NUMBER || '',
    },

    // Un versement exige que les cotisations soient réglées sur le compte marchand (relevé fournisseur).
    requireSettlement: bool(env.REQUIRE_SETTLEMENT_BEFORE_PAYOUT, true),
    // Numéros qui reçoivent le rôle « admin » plateforme à leur connexion (amorçage).
    platformAdmins: (env.PLATFORM_ADMIN_PHONES || '').split(',').map((x) => x.trim()).filter(Boolean),
    remindersEnabled: bool(env.REMINDERS_ENABLED, true),
    ...overrides,
  };

  if (cfg.isProd) {
    const missing = [];
    if (!cfg.jwtSecret) missing.push('JWT_SECRET');
    if (!cfg.otpSecret) missing.push('OTP_SECRET');
    if (!cfg.awa.publicId) missing.push('AWA_PUBLIC_ID');
    if (!cfg.awa.merchantId) missing.push('AWA_MERCHANT_ID');
    if (!cfg.awa.secretKey) missing.push('AWA_SECRET_KEY');
    if (!cfg.whatsapp.phoneNumberId) missing.push('WA_PHONE_NUMBER_ID');
    if (!cfg.whatsapp.accessToken) missing.push('WA_ACCESS_TOKEN');
    if (!cfg.whatsapp.appSecret) missing.push('WA_APP_SECRET');
    if (!cfg.whatsapp.verifyToken) missing.push('WA_VERIFY_TOKEN');
    if (cfg.awa.simulator) throw new Error('AWA_SIMULATOR est interdit en production');
    if (missing.length) throw new Error(`Variables d'environnement manquantes : ${missing.join(', ')}`);
  }
  return cfg;
}
