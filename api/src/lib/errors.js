import { z } from 'zod';

// Messages de validation en français pour toute l'API.
z.config(z.locales.fr());

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, msg, details) => new HttpError(400, code, msg, details);
export const unauthorized = (msg = 'Authentification requise') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Action non autorisée') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'Introuvable') => new HttpError(404, 'not_found', msg);
export const conflict = (code, msg) => new HttpError(409, code, msg);

// Enveloppe les handlers async pour transmettre les erreurs à Express.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw badRequest('validation', 'Données invalides', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}
