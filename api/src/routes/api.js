import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ah, parse } from '../lib/errors.js';
import { CURRENCIES, toMinor } from '../lib/money.js';
import { publicUser } from '../services/auth.js';
import { METHODS } from '../lib/phone.js';

const methodEnum = z.enum(Object.keys(METHODS));

const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(280).optional(),
  amount: z.coerce.number().positive().max(100000000),
  currency: z.enum(CURRENCIES),
  frequency: z.enum(['weekly', 'biweekly', 'monthly']),
  maxMembers: z.coerce.number().int().min(2).max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payoutPhone: z.string().min(9),
  payoutMethod: methodEnum.optional(),
});

export function apiRoutes({ auth, tontine, db, config }) {
  const r = Router();
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

  r.get('/health', (_req, res) => res.json({ ok: true, service: 'ikobi-api', mode: config.nodeEnv }));

  r.get('/config', (_req, res) =>
    res.json({
      methods: Object.entries(METHODS).map(([id, label]) => ({ id, label })),
      currencies: CURRENCIES,
      whatsappNumber: config.whatsapp.botNumberDisplay || null,
      payoutMode: config.payoutMode,
    }),
  );

  // --- Authentification
  r.post('/auth/otp/request', authLimiter, ah(async (req, res) => {
    const { phone } = parse(z.object({ phone: z.string().min(9).max(20) }), req.body);
    res.json(await auth.requestOtp(phone));
  }));

  r.post('/auth/otp/verify', authLimiter, ah(async (req, res) => {
    const b = parse(z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/), name: z.string().max(80).optional() }), req.body);
    res.json(await auth.verifyOtp(b.phone, b.code, b.name));
  }));

  const needAuth = auth.middleware();

  r.get('/me', needAuth, (req, res) => res.json(publicUser(req.user)));

  r.patch('/me', needAuth, ah(async (req, res) => {
    const b = parse(z.object({ name: z.string().trim().min(2).max(80).optional(), pushToken: z.string().max(200).nullable().optional() }), req.body);
    const upd = {};
    if (b.name !== undefined) upd.name = b.name;
    if (b.pushToken !== undefined) upd.push_token = b.pushToken;
    if (Object.keys(upd).length) await db('users').where({ id: req.user.id }).update(upd);
    res.json(publicUser(await db('users').where({ id: req.user.id }).first()));
  }));

  // --- Tontines
  r.get('/groups', needAuth, ah(async (req, res) => res.json(await tontine.myGroups(req.user.id))));

  r.post('/groups', needAuth, ah(async (req, res) => {
    const b = parse(createGroupSchema, req.body);
    const id = await tontine.createGroup(req.user.id, { ...b, amountMinor: toMinor(b.amount) });
    res.status(201).json(await tontine.groupDetail(req.user.id, id));
  }));

  r.post('/groups/join', needAuth, ah(async (req, res) => {
    const b = parse(z.object({ code: z.string().trim().min(4).max(8), payoutPhone: z.string().min(9), payoutMethod: methodEnum.optional() }), req.body);
    const id = await tontine.joinGroup(req.user.id, b);
    res.json(await tontine.groupDetail(req.user.id, id));
  }));

  r.get('/groups/:id', needAuth, ah(async (req, res) => res.json(await tontine.groupDetail(req.user.id, Number(req.params.id)))));

  r.get('/groups/:id/history', needAuth, ah(async (req, res) => res.json(await tontine.history(req.user.id, Number(req.params.id)))));

  r.post('/groups/:id/start', needAuth, ah(async (req, res) => {
    const b = parse(z.object({ order: z.enum(['join', 'random']).default('join'), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.body || {});
    await tontine.startGroup(req.user.id, Number(req.params.id), b);
    res.json(await tontine.groupDetail(req.user.id, Number(req.params.id)));
  }));

  r.post('/groups/:id/contributions', needAuth, ah(async (req, res) => {
    const b = parse(z.object({ phone: z.string().min(9), method: methodEnum.optional() }), req.body);
    const { contribution, reused } = await tontine.initiateContribution(req.user.id, Number(req.params.id), { ...b, channel: 'app' });
    res.status(reused ? 200 : 201).json(await tontine.contributionStatus(req.user.id, contribution.id));
  }));

  r.get('/contributions/:id', needAuth, ah(async (req, res) => res.json(await tontine.contributionStatus(req.user.id, Number(req.params.id)))));

  r.post('/groups/:id/cycles/:number/payout', needAuth, ah(async (req, res) => {
    const p = await tontine.initiatePayout(req.user.id, Number(req.params.id), Number(req.params.number));
    res.status(201).json({ id: p.id, status: p.status, reference: p.reference });
  }));

  return r;
}
