// Client AWA Network — Payment API Gateway (doc : https://docs.awanetwork.tech/, v5.7.2).
//
// - URL : https://api.awanetwork.tech/{public_id}/{payment_c2b | payment_b2c | status}
// - Chaque requête et chaque callback porte un champ `signature` :
//   HMAC-SHA512 (hex minuscule) de la concaténation « clé+valeur » de tous les paramètres,
//   dans l'ordre d'envoi, sans séparateur, signature exclue ; tableaux imbriqués préfixés « clé. ».
// - order_id = notre référence : AWA garantit l'idempotence (même order_id ⇒ même réponse, pas de doublon).
// - Devise documentée : CDF uniquement. Opérateurs RDC : Orange 2013, Airtel 2014, Africell 2015, Vodacom (M-Pesa) 2071.
// - Points non documentés par AWA (à confirmer avec eux) : en-têtes d'authentification, liste des codes
//   d'erreur, « Confirmation Types » du B2C, protection anti-rejeu des callbacks.

import crypto from 'node:crypto';

// Identifiants d'opérateurs (tableau « Available Payment Providers » de la doc). Surchargeables par AWA_PROVIDER_IDS.
export const DEFAULT_PROVIDER_IDS = { orange: 2013, airtel: 2014, africell: 2015, mpesa: 2071 };
export const SIMULATOR_PROVIDER_ID = 14;

// Format du numéro attendu par chaque opérateur (doc AWA) à partir de 243XXXXXXXXX.
export function awaCustomerId(method, phone243) {
  const local = String(phone243).replace(/^243/, ''); // 9 chiffres
  if (method === 'mpesa') return `243${local}`; // Vodacom : 243000000000
  if (method === 'airtel') return local; // Airtel : sans 0 initial (999000000)
  return `0${local}`; // Orange, Africell : 0800000000 / 0900000000
}

function stringValue(v) {
  if (v === null || v === undefined) return '';
  if (v === true) return '1';
  if (v === false) return '';
  return String(v);
}

// Chaîne à signer, fidèle à l'algorithme PHP de la doc (ordre d'insertion conservé).
export function awaSignatureString(params, prefix = '', depth = 0) {
  if (depth > 16) throw new Error('Profondeur maximale dépassée');
  let s = '';
  for (const [k, v] of Object.entries(params)) {
    if (depth === 0 && k === 'signature') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') s += awaSignatureString(v, key, depth + 1);
    else s += key + stringValue(v);
  }
  return s;
}

export function awaSign(params, secretKey) {
  return crypto.createHmac('sha512', secretKey).update(awaSignatureString(params)).digest('hex').toLowerCase();
}

// Codes de statut AWA → états Ikobi.
// 2 = succès. 3 échec, 4 annulé ⇒ échec. 0 initié, 1 en cours, 7 en transit, 6 blocage, -1 indéterminé ⇒ en attente
// (un « indéterminé » n'est jamais traité comme un échec : on revérifie via /status et la réconciliation).
export function mapAwaStatus(code) {
  const n = Number(code);
  if (n === 2) return 'success';
  if (n === 3 || n === 4) return 'failed';
  return 'pending';
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '').toLowerCase());
  const y = Buffer.from(String(b || '').toLowerCase());
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export function createAwaClient(cfg, { fetchImpl = globalThis.fetch, logger = console } = {}) {
  const providerIds = { ...DEFAULT_PROVIDER_IDS, ...(cfg.providerIds || {}) };
  const base = `${cfg.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(cfg.publicId)}`;

  async function call(endpoint, params) {
    const body = { ...params, signature: awaSign(params, cfg.secretKey) };
    let res;
    try {
      res = await fetchImpl(`${base}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // Réseau coupé : on ne sait pas si AWA a reçu la demande. Grâce à l'order_id idempotent,
      // la transaction reste « en attente » et sera tranchée par /status.
      logger.warn?.({ endpoint, err: e.message }, 'AWA injoignable');
      return { httpStatus: 0, body: null };
    }
    const json = await res.json().catch(() => null);
    return { httpStatus: res.status, body: json };
  }

  function providerId(method) {
    if (cfg.simulator) return SIMULATOR_PROVIDER_ID;
    const id = providerIds[method];
    if (!id) throw new Error(`Opérateur non pris en charge par AWA : ${method}`);
    return id;
  }

  async function transact(endpoint, p) {
    if (p.currency !== 'CDF') {
      return { accepted: false, errorCode: 'currency', error: 'AWA Network accepte uniquement le franc congolais (CDF) pour le moment' };
    }
    const params = {
      merchant_id: cfg.merchantId,
      customer_id: awaCustomerId(p.method, p.phone),
      order_id: p.reference,
      amount: Number(p.amount).toFixed(2),
      currency: p.currency,
      country: 'CD',
      callback_url: p.callbackUrl,
      provider_id: providerId(p.method),
    };
    const { httpStatus, body } = await call(endpoint, params);
    if (httpStatus === 0) return { accepted: true, providerTxId: null, finalStatus: 'pending', uncertain: true };
    const resultCode = Number(body?.result?.code);
    const status = Number(body?.status);
    if (httpStatus >= 400 || !body || (Number.isFinite(resultCode) && resultCode !== 0 && status !== 2 && status !== 1 && status !== 0)) {
      const msg = body?.provider_result?.message || body?.result?.message || 'Paiement refusé';
      logger.warn?.({ endpoint, reference: p.reference, httpStatus, resultCode, status }, 'AWA a refusé la transaction');
      return { accepted: false, errorCode: resultCode || httpStatus, error: msg, raw: body };
    }
    const finalStatus = mapAwaStatus(status);
    if (finalStatus === 'failed') {
      return { accepted: false, errorCode: status, error: body?.provider_result?.message || 'Paiement refusé par l’opérateur', raw: body };
    }
    return {
      accepted: true,
      providerTxId: body.transaction_id || null,
      finalStatus,
      // B2C : une confirmation supplémentaire peut être exigée (section non publiée par AWA).
      confirmationRequired: Number(body.confirm_type || 0) !== 0,
      raw: body,
    };
  }

  return {
    name: 'awa',
    debit: (p) => transact('payment_c2b', p),
    credit: (p) => transact('payment_b2c', p),

    async verify(reference) {
      const { httpStatus, body } = await call('status', { merchant_id: cfg.merchantId, order_id: reference });
      if (httpStatus === 0 || httpStatus >= 400 || !body) return { status: 'pending' };
      return {
        status: mapAwaStatus(body.status),
        providerTxId: body.transaction_id || null,
        description: body.provider_result?.message || body.result?.message || null,
        raw: body,
      };
    },

    // Callback : JSON avec `signature` dans le corps. On recalcule la signature sur les champs
    // reçus, dans leur ordre d'arrivée, et on vérifie le marchand.
    parseCallback(rawBody) {
      let data;
      try {
        data = JSON.parse(rawBody);
      } catch {
        const e = new Error('JSON invalide');
        e.status = 400;
        throw e;
      }
      if (!safeEqual(awaSign(data, cfg.secretKey), data.signature)) {
        const e = new Error('Signature invalide');
        e.status = 401;
        throw e;
      }
      if (String(data.merchant_id) !== String(cfg.merchantId)) {
        const e = new Error('Marchand inconnu');
        e.status = 401;
        throw e;
      }
      return {
        reference: data.order_id,
        status: mapAwaStatus(data.status),
        providerTxId: data.transaction_id || data.transaction_ref || null,
        description: data.provider_result?.message || data.result?.message || null,
        amount: data.amount,
        raw: data,
      };
    },
  };
}
