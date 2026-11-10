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

    moko: {
      baseUrl: env.MOKO_BASE_URL || 'https://paydrc.gofreshbakery.net/api/v5',
      merchantId: env.MOKO_MERCHANT_ID || '',
      merchantSecret: env.MOKO_MERCHANT_SECRET || '',
      // Clés de sécurité du callback (fournies par MOKO).
      aesKey: env.MOKO_AES_KEY || '',
      aesIv: env.MOKO_AES_IV || '', // par défaut = clé AES (pratique observée dans la doc MOKO)
      hmacKey: env.MOKO_HMAC_KEY || '',
      // Montant facturé avec le nom/prénom/email exigés par MOKO.
      defaultEmail: env.MOKO_DEFAULT_EMAIL || 'paiements@ikobi.app',
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

    // manual : l'admin du groupe déclenche le versement ; auto : versement dès que tout le monde a payé.
    payoutMode: env.PAYOUT_MODE === 'auto' ? 'auto' : 'manual',
    remindersEnabled: bool(env.REMINDERS_ENABLED, true),
    ...overrides,
  };

  if (cfg.isProd) {
    const missing = [];
    if (!cfg.jwtSecret) missing.push('JWT_SECRET');
    if (!cfg.otpSecret) missing.push('OTP_SECRET');
    if (!cfg.moko.merchantId) missing.push('MOKO_MERCHANT_ID');
    if (!cfg.moko.merchantSecret) missing.push('MOKO_MERCHANT_SECRET');
    if (!cfg.moko.hmacKey) missing.push('MOKO_HMAC_KEY');
    if (!cfg.moko.aesKey) missing.push('MOKO_AES_KEY');
    if (!cfg.whatsapp.phoneNumberId) missing.push('WA_PHONE_NUMBER_ID');
    if (!cfg.whatsapp.accessToken) missing.push('WA_ACCESS_TOKEN');
    if (!cfg.whatsapp.appSecret) missing.push('WA_APP_SECRET');
    if (!cfg.whatsapp.verifyToken) missing.push('WA_VERIFY_TOKEN');
    if (missing.length) throw new Error(`Variables d'environnement manquantes : ${missing.join(', ')}`);
  }
  return cfg;
}
