// Portail développeurs : demandes de clé, émission et vérification des clés partenaires,
// statistiques agrégées (aucune donnée personnelle).

import crypto from 'node:crypto';
import { insertId } from '../db.js';
import { conflict, forbidden, notFound, unauthorized, HttpError } from '../lib/errors.js';
import { fromMinor } from '../lib/money.js';

const KEY_PREFIX = 'ikb_live_';
// En dessous de ce nombre de communautés, les chiffres ne sont pas publiés (anti-réidentification).
const MIN_AGGREGATE = 5;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createDeveloperService({ db, audit, config }) {
  async function submitRequest(input, ip) {
    const ipHash = ip ? sha256(`${config.otpSecret}:${ip}`) : null;
    // Limite simple : 3 demandes par e-mail et par jour.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await db('api_key_requests').where({ email: input.email.toLowerCase() }).andWhere('created_at', '>', since).count({ c: '*' }).first();
    if (Number(recent.c) >= 3) throw new HttpError(429, 'too_many_requests', 'Vous avez déjà envoyé plusieurs demandes aujourd’hui. Nous revenons vers vous par e-mail.');
    const id = await insertId(db('api_key_requests').insert({
      org_name: input.orgName,
      org_type: input.orgType,
      country: input.country,
      contact_name: input.contactName,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      website: input.website || null,
      use_case: input.useCase,
      volume: input.volume || null,
      ip_hash: ipHash,
      created_at: new Date(),
      updated_at: new Date(),
    }, ['id']));
    await audit.log({ actorType: 'system', action: 'api_key.requested', entity: 'api_key_request', entityId: id, data: { org: input.orgName, type: input.orgType } });
    return { id, status: 'requested' };
  }

  async function listRequests(status) {
    const q = db('api_key_requests').orderBy('id', 'desc').limit(200);
    if (status) q.where({ status });
    return q;
  }

  // La clé n'est renvoyée qu'UNE fois, à l'approbation ; seule son empreinte est stockée.
  async function approve(reviewerId, requestId, { scopes = ['insights:read'], note } = {}) {
    const req = await db('api_key_requests').where({ id: requestId }).first();
    if (!req) throw notFound('Demande introuvable');
    if (req.status !== 'requested') throw conflict('already_reviewed', 'Demande déjà traitée');
    const secret = KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
    const ok = await db('api_key_requests').where({ id: requestId, status: 'requested' })
      .update({ status: 'approved', reviewed_by: reviewerId, review_note: note || null, updated_at: db.fn.now() });
    if (!ok) throw conflict('already_reviewed', 'Demande déjà traitée');
    await db('api_keys').insert({
      request_id: requestId, partner_name: req.org_name, prefix: secret.slice(0, 16), key_hash: sha256(secret), scopes: scopes.join(' '),
    });
    await audit.log({ actorId: reviewerId, action: 'api_key.issued', entity: 'api_key_request', entityId: requestId, data: { prefix: secret.slice(0, 16), scopes } });
    return { apiKey: secret, prefix: secret.slice(0, 16), partner: req.org_name, scopes, warning: 'Transmets cette clé par un canal sûr : elle ne sera plus jamais affichée.' };
  }

  async function reject(reviewerId, requestId, note) {
    const ok = await db('api_key_requests').where({ id: requestId, status: 'requested' })
      .update({ status: 'rejected', reviewed_by: reviewerId, review_note: (note || '').slice(0, 200), updated_at: db.fn.now() });
    if (!ok) throw conflict('already_reviewed', 'Demande introuvable ou déjà traitée');
    await audit.log({ actorId: reviewerId, action: 'api_key.request_rejected', entity: 'api_key_request', entityId: requestId, data: { note } });
    return { id: requestId, status: 'rejected' };
  }

  async function revoke(actorId, keyId) {
    const ok = await db('api_keys').where({ id: keyId, status: 'active' }).update({ status: 'revoked', updated_at: db.fn.now() });
    if (!ok) throw notFound('Clé introuvable ou déjà révoquée');
    await audit.log({ actorId, action: 'api_key.revoked', entity: 'api_key', entityId: keyId });
    return { id: keyId, status: 'revoked' };
  }

  async function listKeys() {
    return db('api_keys').select('id', 'partner_name', 'prefix', 'scopes', 'status', 'last_used_at', 'created_at').orderBy('id', 'desc');
  }

  function partnerAuth(scope) {
    return async (req, _res, next) => {
      try {
        const h = req.get('authorization') || '';
        const key = h.startsWith('Bearer ') ? h.slice(7).trim() : (req.get('x-api-key') || '').trim();
        if (!key.startsWith(KEY_PREFIX)) throw unauthorized('Clé API manquante ou invalide');
        const row = await db('api_keys').where({ key_hash: sha256(key) }).first();
        if (!row || row.status !== 'active') throw unauthorized('Clé API invalide ou révoquée');
        if (scope && !row.scopes.split(' ').includes(scope)) throw forbidden(`Cette clé n'a pas le droit « ${scope} »`);
        req.partner = { id: row.id, name: row.partner_name, scopes: row.scopes.split(' ') };
        db('api_keys').where({ id: row.id }).update({ last_used_at: new Date() }).catch(() => {});
        next();
      } catch (e) {
        next(e);
      }
    };
  }

  // Indicateurs agrégés de la plateforme, sans aucune donnée personnelle.
  async function insights() {
    const groups = await db('groups').select('status').count({ n: '*' }).groupBy('status');
    const byStatus = Object.fromEntries(groups.map((g) => [g.status, Number(g.n)]));
    const totalGroups = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const generatedAt = new Date().toISOString();
    if (totalGroups < MIN_AGGREGATE) {
      return { generatedAt, available: false, reason: `Données publiées à partir de ${MIN_AGGREGATE} communautés, pour protéger les membres.` };
    }
    const members = await db('memberships').countDistinct({ n: 'user_id' }).first();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const vol = await db('contributions').where({ status: 'success' }).select('currency').count({ n: '*' }).sum({ s: 'amount_minor' }).groupBy('currency');
    const vol30 = await db('contributions').where({ status: 'success' }).andWhere('updated_at', '>', since).select('currency').count({ n: '*' }).sum({ s: 'amount_minor' }).groupBy('currency');
    const onTime = await db('contributions as c').join('cycles as cy', 'cy.id', 'c.cycle_id').where('c.status', 'success').select('c.updated_at', 'cy.due_date');
    const punctual = onTime.filter((r) => String(r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at).slice(0, 10) <= r.due_date).length;
    const cycles = await db('cycles').where({ status: 'closed' }).count({ n: '*' }).first();
    return {
      generatedAt,
      available: true,
      communities: { total: totalGroups, forming: byStatus.forming || 0, active: byStatus.active || 0, completed: byStatus.completed || 0 },
      members: Number(members.n),
      completedCycles: Number(cycles.n),
      contributions: {
        allTime: vol.map((v) => ({ currency: v.currency, count: Number(v.n), volume: fromMinor(Number(v.s)) })),
        last30Days: vol30.map((v) => ({ currency: v.currency, count: Number(v.n), volume: fromMinor(Number(v.s)) })),
        onTimeRate: onTime.length ? Math.round((punctual / onTime.length) * 1000) / 10 : null,
      },
      note: 'Chiffres agrégés et indicatifs. Ils ne constituent ni une évaluation de crédit ni une décision de financement.',
    };
  }

  return { submitRequest, listRequests, approve, reject, revoke, listKeys, partnerAuth, insights };
}
