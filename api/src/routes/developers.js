import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ah, parse, badRequest } from '../lib/errors.js';

export const ORG_TYPES = ['banque', 'imf', 'cooperative', 'association', 'ong', 'entreprise', 'developpeur', 'autre'];

const requestSchema = z.object({
  orgName: z.string().trim().min(2, 'Nom de l’organisation trop court').max(120),
  orgType: z.enum(ORG_TYPES),
  country: z.string().trim().length(2, 'Pays invalide').transform((s) => s.toUpperCase()),
  contactName: z.string().trim().min(2, 'Indiquez le nom du contact').max(80),
  email: z.string().trim().email('E-mail invalide').max(160),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  website: z.string().trim().url('Adresse du site invalide').max(200).optional().or(z.literal('')),
  useCase: z.string().trim().min(30, 'Décrivez votre projet en quelques phrases (30 caractères minimum)').max(2000),
  volume: z.enum(['<100', '100-1000', '1000-10000', '>10000']).optional().or(z.literal('')),
  consent: z.literal(true, { error: 'Cochez la case pour accepter le traitement de votre demande' }),
  company: z.string().max(0).optional(), // piège à robots : doit rester vide
});

// Routes publiques du portail (fonctionnent même si les clés de paiement ne sont pas encore configurées).
export function developerPublicRoutes({ developers }) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

  r.post('/developers/key-requests', limiter, ah(async (req, res) => {
    if (req.body?.company) throw badRequest('rejected', 'Demande refusée'); // robot
    const b = parse(requestSchema, req.body);
    res.status(201).json(await developers.submitRequest(b, req.ip));
  }));

  return r;
}

// API partenaire v1 (bêta) : lecture seule, données agrégées.
export function partnerRoutes({ developers }) {
  const r = Router();
  r.use(rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));
  r.get('/ping', developers.partnerAuth(), (req, res) => res.json({ ok: true, partner: req.partner.name, scopes: req.partner.scopes }));
  r.get('/insights', developers.partnerAuth('insights:read'), ah(async (_req, res) => res.json(await developers.insights())));
  return r;
}

// Administration des clés (équipe Ikobi).
export function developerOpsRoutes({ developers, requireRole }) {
  const r = Router();
  const admin = requireRole('admin');
  r.get('/api-key-requests', requireRole('admin', 'compliance'), ah(async (req, res) => res.json(await developers.listRequests(req.query.status ? String(req.query.status) : undefined))));
  r.post('/api-key-requests/:id/approve', admin, ah(async (req, res) => {
    const b = parse(z.object({ scopes: z.array(z.enum(['insights:read'])).min(1).default(['insights:read']), note: z.string().max(200).optional() }), req.body || {});
    res.status(201).json(await developers.approve(req.user.id, Number(req.params.id), b));
  }));
  r.post('/api-key-requests/:id/reject', admin, ah(async (req, res) => {
    const b = parse(z.object({ note: z.string().max(200).optional() }), req.body || {});
    res.json(await developers.reject(req.user.id, Number(req.params.id), b.note));
  }));
  r.get('/api-keys', admin, ah(async (_req, res) => res.json(await developers.listKeys())));
  r.post('/api-keys/:id/revoke', admin, ah(async (req, res) => res.json(await developers.revoke(req.user.id, Number(req.params.id)))));
  return r;
}
