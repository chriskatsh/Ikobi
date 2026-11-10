// Client MOKO Afrika (agrégateur Mobile Money RDC : M-Pesa, Orange, Airtel, Afrimoney).
// Doc : https://moko-africa-documentation.vercel.app
// Modèle asynchrone : la réponse initiale n'est qu'un accusé ; le statut final
// arrive par callback chiffré (AES-CBC + HMAC-SHA256) et peut être vérifié via action=verify.

import crypto from 'node:crypto';

const MOKO_ERRORS = {
  400: "Erreur pendant l'exécution du paiement",
  401: 'Montant non autorisé',
  402: 'Solde insuffisant',
  404: 'Compte ou transaction non reconnu',
  405: 'Numéro de téléphone invalide (doit commencer par 243)',
  407: 'Devise invalide (USD ou CDF uniquement)',
  408: 'Action non reconnue',
  409: 'Service de paiement momentanément indisponible',
  500: 'Erreur interne du service de paiement',
};

export function mapTransStatus(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'success' || v === 'successful' || v === 'completed') return 'success';
  if (v === 'failed' || v === 'failure' || v === 'cancelled' || v === 'canceled' || v === 'rejected') return 'failed';
  return 'pending';
}

function aesAlgo(key) {
  const len = Buffer.from(key, 'utf8').length;
  if (len === 16) return 'aes-128-cbc';
  if (len === 24) return 'aes-192-cbc';
  if (len === 32) return 'aes-256-cbc';
  throw new Error('MOKO_AES_KEY doit faire 16, 24 ou 32 caractères');
}

export function decryptMokoPayload(encrypted, key, iv) {
  const k = Buffer.from(key, 'utf8');
  const i = Buffer.from(iv || key, 'utf8').subarray(0, 16);
  const decipher = crypto.createDecipheriv(aesAlgo(key), k, i);
  const out = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]);
  return JSON.parse(out.toString('utf8'));
}

export function encryptMokoPayload(obj, key, iv) {
  const k = Buffer.from(key, 'utf8');
  const i = Buffer.from(iv || key, 'utf8').subarray(0, 16);
  const cipher = crypto.createCipheriv(aesAlgo(key), k, i);
  return Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]).toString('base64');
}

export function signMoko(data, hmacKey) {
  return crypto.createHmac('sha256', hmacKey).update(data).digest('hex');
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function createMokoClient(cfg, { fetchImpl = globalThis.fetch, logger = console } = {}) {
  let token = null;
  let tokenAt = 0;

  async function getToken() {
    if (token && Date.now() - tokenAt < 50 * 60 * 1000) return token;
    const res = await fetchImpl(`${cfg.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant_id: cfg.merchantId, merchant_secrete: cfg.merchantSecret }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.token) throw new Error(`MOKO token: HTTP ${res.status}`);
    token = body.token;
    tokenAt = Date.now();
    return token;
  }

  async function call(payload) {
    const t = await getToken();
    const res = await fetchImpl(`${cfg.baseUrl}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ merchant_id: cfg.merchantId, merchant_secrete: cfg.merchantSecret, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) token = null; // forcer le renouvellement au prochain appel
    return { httpStatus: res.status, body };
  }

  async function transact(action, p) {
    const { httpStatus, body } = await call({
      amount: String(p.amount),
      currency: p.currency,
      action,
      customer_number: p.phone,
      firstname: p.firstname || 'Membre',
      lastname: p.lastname || 'Ikobi',
      'e-mail': p.email || cfg.defaultEmail,
      reference: p.reference,
      method: p.method,
      callback_url: p.callbackUrl,
    });
    if (httpStatus >= 400 || body.resultCode === 1 || body.resultCodeError) {
      const code = Number(body.resultCodeError || httpStatus);
      logger.warn?.({ action, reference: p.reference, code }, 'MOKO a refusé la transaction');
      return { accepted: false, errorCode: code, error: MOKO_ERRORS[code] || 'Paiement refusé', raw: body };
    }
    const final = mapTransStatus(body.Trans_Status);
    return { accepted: true, providerTxId: body.Transaction_id || null, finalStatus: final, raw: body };
  }

  return {
    debit: (p) => transact('debit', p),
    credit: (p) => transact('credit', p),

    async verify(reference) {
      const { httpStatus, body } = await call({ action: 'verify', reference });
      if (httpStatus >= 400 || body.resultCode === 1) return { status: 'pending', raw: body };
      return {
        status: mapTransStatus(body.Trans_Status),
        providerTxId: body.Transaction_id || null,
        description: body.Trans_Status_Description || body.Comment || null,
        raw: body,
      };
    },

    // Vérifie la signature puis déchiffre le callback. Lève une erreur si invalide.
    parseCallback(rawBody, signature) {
      let envelope;
      try {
        envelope = JSON.parse(rawBody);
      } catch {
        const e = new Error('JSON invalide');
        e.status = 400;
        throw e;
      }
      const data = envelope?.data;
      if (cfg.hmacKey) {
        const expected = signMoko(typeof data === 'string' ? data : JSON.stringify(data), cfg.hmacKey);
        if (!safeEqualHex(expected, String(signature || '').toLowerCase())) {
          const e = new Error('Signature invalide');
          e.status = 401;
          throw e;
        }
      }
      if (typeof data === 'string' && cfg.aesKey) {
        try {
          return decryptMokoPayload(data, cfg.aesKey, cfg.aesIv);
        } catch {
          const e = new Error('Chiffrement invalide');
          e.status = 400;
          throw e;
        }
      }
      // Sans clé AES (dev) : le payload peut arriver en clair.
      return typeof data === 'object' && data ? data : envelope;
    },
  };
}

// Faux MOKO pour le développement et les tests : aucune somme réelle n'est débitée.
export function createMockMoko() {
  const txs = new Map();
  let n = 0;
  const start = (action) => async (p) => {
    if (p.phone?.endsWith('0000402')) return { accepted: false, errorCode: 402, error: MOKO_ERRORS[402] };
    const id = `MOCK-${++n}`;
    txs.set(p.reference, { action, status: 'pending', providerTxId: id, ...p });
    return { accepted: true, providerTxId: id, finalStatus: 'pending' };
  };
  return {
    isMock: true,
    txs,
    debit: start('debit'),
    credit: start('credit'),
    async verify(reference) {
      const t = txs.get(reference);
      return t ? { status: t.status, providerTxId: t.providerTxId } : { status: 'pending' };
    },
    parseCallback(rawBody) {
      const b = JSON.parse(rawBody);
      return b.data && typeof b.data === 'object' ? b.data : b;
    },
    settle(reference, status = 'success') {
      const t = txs.get(reference);
      if (t) t.status = status;
      return t;
    },
  };
}
