// Tour de contrôle financière (équipe Ikobi). Toute action est journalisée.
import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../lib/errors.js';
import { requireRole } from '../services/auth.js';

export function opsRoutes({ auth, tontine, audit, db }) {
  const r = Router();
  r.use(auth.middleware());
  const finance = requireRole('finance', 'admin');

  r.get('/reconciliation', requireRole('ops', 'finance', 'compliance', 'admin'), ah(async (_req, res) => res.json(await tontine.reconciliation())));

  r.get('/payout-requests', finance, ah(async (_req, res) => res.json(await tontine.payoutQueue())));

  r.post('/payout-requests/:id/review', finance, ah(async (req, res) => {
    const b = parse(z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(200).optional() }), req.body);
    const out = await tontine.reviewPayout(req.user.id, Number(req.params.id), b);
    res.json(out);
  }));

  r.post('/settlements', finance, ah(async (req, res) => {
    const b = parse(z.object({
      provider: z.string().min(2).max(20),
      currency: z.enum(['USD', 'CDF']),
      references: z.array(z.string().min(5).max(40)).min(1).max(5000),
      statementTotal: z.coerce.number().positive(),
      statementRef: z.string().max(40).optional(),
    }), req.body);
    res.json(await tontine.settle(req.user.id, b));
  }));

  r.get('/audit', requireRole('compliance', 'admin'), ah(async (req, res) => {
    res.json(await audit.list({ entity: req.query.entity ? String(req.query.entity) : undefined, entityId: req.query.entityId ? String(req.query.entityId) : undefined }));
  }));

  // Règles de frais : lecture par la finance, création réservée à l'admin, toujours journalisée.
  r.get('/fee-rules', finance, ah(async (_req, res) => res.json(await db('fee_rules').orderBy('id'))));
  r.post('/fee-rules', requireRole('admin'), ah(async (req, res) => {
    const b = parse(z.object({
      country: z.string().length(2).or(z.literal('*')).default('*'),
      provider: z.string().max(20).default('*'),
      method: z.string().max(12).default('*'),
      txType: z.enum(['contribution', 'payout']),
      currency: z.enum(['USD', 'CDF', '*']).default('*'),
      pctBp: z.number().int().min(0).max(1500),
      fixedMinor: z.number().int().min(0).default(0),
    }), req.body);
    const [id] = await db('fee_rules').insert({ country: b.country, provider: b.provider, method: b.method, tx_type: b.txType, currency: b.currency, pct_bp: b.pctBp, fixed_minor: b.fixedMinor });
    await audit.log({ actorId: req.user.id, action: 'fee_rule.created', entity: 'fee_rule', entityId: id ?? 'new', data: b });
    res.status(201).json({ ok: true });
  }));
  r.post('/fee-rules/:id/deactivate', requireRole('admin'), ah(async (req, res) => {
    await db('fee_rules').where({ id: Number(req.params.id) }).update({ active: false });
    await audit.log({ actorId: req.user.id, action: 'fee_rule.deactivated', entity: 'fee_rule', entityId: req.params.id });
    res.json({ ok: true });
  }));

  return r;
}
