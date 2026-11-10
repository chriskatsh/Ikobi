// Connexion sans mot de passe : code à 6 chiffres envoyé sur WhatsApp.
import { toMs } from '../lib/dates.js';

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { badRequest, unauthorized, HttpError } from '../lib/errors.js';
import { normalizePhone } from '../lib/phone.js';
import { insertId } from '../db.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

export function createAuthService({ db, whatsapp, config }) {
  const hash = (phone, code) => crypto.createHmac('sha256', config.otpSecret).update(`${phone}:${code}`).digest('hex');

  async function requestOtp(rawPhone) {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw badRequest('invalid_phone', 'Numéro invalide. Exemple : 0812345678');
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await db('otp_codes').where({ phone }).andWhere('created_at', '>', since).count({ c: '*' }).first();
    if (Number(recent.c) >= MAX_CODES_PER_HOUR) {
      throw new HttpError(429, 'too_many_codes', 'Trop de codes demandés. Réessaie dans une heure.');
    }
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await db('otp_codes').insert({ phone, code_hash: hash(phone, code), expires_at: new Date(Date.now() + OTP_TTL_MS), created_at: new Date() });
    const sent = await whatsapp.sendTemplate(phone, config.whatsapp.otpTemplate, [code], { buttonParam: code });
    return { phone, sent: !sent?.skipped && sent?.ok !== false, ...(config.otpDebug ? { debugCode: code } : {}) };
  }

  async function verifyOtp(rawPhone, code, name) {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw badRequest('invalid_phone', 'Numéro invalide');
    const row = await db('otp_codes').where({ phone }).whereNull('used_at').orderBy('id', 'desc').first();
    if (!row || toMs(row.expires_at) < Date.now()) throw unauthorized('Code expiré. Demande un nouveau code.');
    if (row.attempts >= MAX_ATTEMPTS) throw unauthorized('Trop de tentatives. Demande un nouveau code.');
    const ok = crypto.timingSafeEqual(Buffer.from(hash(phone, String(code))), Buffer.from(row.code_hash));
    if (!ok) {
      await db('otp_codes').where({ id: row.id }).increment('attempts', 1);
      throw unauthorized('Code incorrect');
    }
    await db('otp_codes').where({ id: row.id }).update({ used_at: db.fn.now() });

    let user = await db('users').where({ phone }).first();
    if (!user) {
      const id = await insertId(db('users').insert({ phone, name: (name || '').trim().slice(0, 80) }, ['id']));
      user = await db('users').where({ id }).first();
    } else if (name && !user.name) {
      await db('users').where({ id: user.id }).update({ name: name.trim().slice(0, 80) });
      user = await db('users').where({ id: user.id }).first();
    }
    const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '60d' });
    return { token, user: publicUser(user), isNew: !user.name };
  }

  function middleware() {
    return async (req, _res, next) => {
      try {
        const h = req.headers.authorization || '';
        const t = h.startsWith('Bearer ') ? h.slice(7) : null;
        if (!t) throw unauthorized();
        let payload;
        try {
          payload = jwt.verify(t, config.jwtSecret);
        } catch {
          throw unauthorized('Session expirée. Reconnecte-toi.');
        }
        const user = await db('users').where({ id: payload.sub }).first();
        if (!user || String(user.phone).startsWith('del-')) throw unauthorized();
        req.user = user;
        next();
      } catch (e) {
        next(e);
      }
    };
  }

  return { requestOtp, verifyOtp, middleware };
}

export function publicUser(u) {
  return { id: u.id, phone: u.phone, name: u.name };
}
