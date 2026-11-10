import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { normalizePhone, detectMethod } from '../src/lib/phone.js';
import { createPaymentOrchestrator } from '../src/services/payments.js';
import { loadConfig } from '../src/config.js';
import { addPeriods } from '../src/lib/dates.js';
import { awaSign, awaSignatureString, awaCustomerId, mapAwaStatus, createAwaClient } from '../src/services/awa.js';

describe('utilitaires', () => {
  test('normalise les numéros RDC', () => {
    assert.equal(normalizePhone('0812345678'), '243812345678');
    assert.equal(normalizePhone('+243 97 123 4567'), '243971234567');
    assert.equal(normalizePhone('00243851234567'), '243851234567');
    assert.equal(normalizePhone('12345'), null);
    assert.equal(detectMethod('0812345678'), 'mpesa');
    assert.equal(detectMethod('0971234567'), 'airtel');
    assert.equal(detectMethod('0851234567'), 'orange');
    assert.equal(detectMethod('0901234567'), 'africell');
  });

  test('calcule les échéances', () => {
    assert.equal(addPeriods('2026-01-31', 'monthly', 1), '2026-02-28');
    assert.equal(addPeriods('2026-01-01', 'weekly', 2), '2026-01-15');
    assert.equal(addPeriods('2026-12-15', 'monthly', 1), '2027-01-15');
  });

  test('AWA : chaîne à signer conforme à la doc (ordre, sans séparateur)', () => {
    const params = { merchant_id: 'fffed61be9780b97c5e4c65e4e07bb6b', provider_id: 10, client_id: '080000000', country: 'KE', order_id: 'order_3444298767545', amount: 1000, currency: 'CDF', callback_url: 'https://my.callback.url' };
    assert.equal(awaSignatureString(params), 'merchant_idfffed61be9780b97c5e4c65e4e07bb6bprovider_id10client_id080000000countryKEorder_idorder_3444298767545amount1000currencyCDFcallback_urlhttps://my.callback.url');
    assert.equal(awaSignatureString({ a: 1, signature: 'x', result: { code: 0, message: 'OK' } }), 'a1result.code0result.messageOK');
    assert.match(awaSign(params, 'secret'), /^[0-9a-f]{128}$/);
  });

  test('AWA : format des numéros par opérateur', () => {
    assert.equal(awaCustomerId('mpesa', '243812345678'), '243812345678');
    assert.equal(awaCustomerId('airtel', '243991234567'), '991234567');
    assert.equal(awaCustomerId('orange', '243851234567'), '0851234567');
    assert.equal(awaCustomerId('africell', '243901234567'), '0901234567');
  });

  test('AWA : statuts (indéterminé ≠ échec)', () => {
    assert.equal(mapAwaStatus(2), 'success');
    assert.equal(mapAwaStatus(3), 'failed');
    assert.equal(mapAwaStatus(4), 'failed');
    for (const s of [-1, 0, 1, 6, 7]) assert.equal(mapAwaStatus(s), 'pending');
  });

  test('AWA : requête signée, CDF uniquement, callback vérifié', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => ({ order_id: 'IKC-1', transaction_id: '', status: 1, result: { code: 0, message: 'OK' }, confirm_type: 0 }) };
    };
    const cfg = { baseUrl: 'https://api.awanetwork.tech', publicId: 'PUB', merchantId: 'M1', secretKey: 'k3y' };
    const awa = createAwaClient(cfg, { fetchImpl, logger: { warn() {} } });
    const r = await awa.debit({ amount: 20000, currency: 'CDF', phone: '243812345678', method: 'mpesa', reference: 'IKC-1', callbackUrl: 'https://api.ikobi.app/webhooks/awa' });
    assert.equal(r.accepted, true);
    assert.equal(r.finalStatus, 'pending');
    assert.equal(calls[0].url, 'https://api.awanetwork.tech/PUB/payment_c2b');
    const sent = calls[0].body;
    assert.equal(sent.amount, '20000.00');
    assert.equal(sent.provider_id, 2071);
    const { signature, ...rest } = sent;
    assert.equal(signature, awaSign(rest, 'k3y'));

    const usd = await awa.debit({ amount: 50, currency: 'USD', phone: '243812345678', method: 'mpesa', reference: 'IKC-2' });
    assert.equal(usd.accepted, false);

    const cb = { merchant_id: 'M1', operation_type: 17, customer_id: '243812345678', amount: 20000, order_id: 'IKC-1', transaction_id: '77', status: 2, result: { code: 0, message: 'OK' } };
    const signed = { ...cb, signature: awaSign(cb, 'k3y') };
    const parsed = awa.parseCallback(JSON.stringify(signed));
    assert.deepEqual([parsed.reference, parsed.status, parsed.providerTxId], ['IKC-1', 'success', '77']);
    assert.throws(() => awa.parseCallback(JSON.stringify({ ...signed, amount: 999999 })), /Signature invalide/);
    const otherMerchant = { ...cb, merchant_id: 'M2' };
    assert.throws(() => awa.parseCallback(JSON.stringify({ ...otherMerchant, signature: awaSign(otherMerchant, 'k3y') })), /Marchand inconnu/);
  });

  test('orchestrateur : RDC via AWA en CDF uniquement ; Gabon sans fournisseur', () => {
    const o = createPaymentOrchestrator({ providers: { awa: { debit() {} } } });
    assert.deepEqual(o.supportedCurrencies('CD'), ['CDF']);
    assert.deepEqual(o.supportedCurrencies('GA'), []);
    assert.throws(() => o.route('CD', 'mpesa', 'USD'), /USD/);
    assert.throws(() => o.route('GA', 'airtel', 'XAF'), /indisponible/);
    assert.equal(o.route('CD', 'orange', 'CDF').name, 'awa');
  });

  test('production : simulateur et clés manquantes refusés', () => {
    const saved = { ...process.env };
    Object.assign(process.env, { JWT_SECRET: 'a', OTP_SECRET: 'b', AWA_PUBLIC_ID: 'p', AWA_MERCHANT_ID: 'm', AWA_SECRET_KEY: 's', WA_APP_SECRET: 'w', WA_VERIFY_TOKEN: 'v', WA_PHONE_NUMBER_ID: '1', WA_ACCESS_TOKEN: 't', AWA_SIMULATOR: '1' });
    assert.throws(() => loadConfig({ nodeEnv: 'production', isProd: true }), /SIMULATOR/);
    delete process.env.AWA_SECRET_KEY;
    process.env.AWA_SIMULATOR = '0';
    assert.throws(() => loadConfig({ nodeEnv: 'production', isProd: true }), /AWA_SECRET_KEY/);
    process.env = saved;
  });

  test('AWA : réseau coupé ⇒ paiement « en attente », jamais « échoué »', async () => {
    const awa = createAwaClient({ baseUrl: 'x', publicId: 'P', merchantId: 'M', secretKey: 'k' }, { fetchImpl: async () => { throw new Error('ECONNRESET'); }, logger: { warn() {} } });
    const r = await awa.debit({ amount: 1000, currency: 'CDF', phone: '243812345678', method: 'orange', reference: 'IKC-9' });
    assert.equal(r.accepted, true);
    assert.equal(r.finalStatus, 'pending');
  });
});

describe('parcours complet d\'une tontine', () => {
  let t;
  let a, b, c;
  let groupId;

  before(async () => {
    t = await setup();
    a = await t.login('0812345678', 'Aline Mbuyi');
    b = await t.login('0971234567', 'Bénédicte Kasongo');
    c = await t.login('0851234567', 'Christian Lukusa');
  });
  after(() => t.close());

  test('refuse un code OTP incorrect', async () => {
    await t.agent.post('/v1/auth/otp/request').send({ phone: '0899999999' });
    const r = await t.agent.post('/v1/auth/otp/verify').send({ phone: '0899999999', code: '000000' });
    assert.equal(r.status, 401);
  });

  test('crée une tontine', async () => {
    const r = await t.agent.post('/v1/groups').set(a.auth).send({
      name: 'Likelemba Famille', amount: 50, currency: 'USD', frequency: 'monthly',
      maxMembers: 3, startDate: '2030-01-05', payoutPhone: '0812345678',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.myRole, 'admin');
    assert.match(r.body.inviteCode, /^[A-Z0-9]{6}$/);
    groupId = r.body.id;
  });

  test('les membres rejoignent avec le code, le groupe se remplit', async () => {
    const g = await t.agent.get(`/v1/groups/${groupId}`).set(a.auth);
    const r1 = await t.agent.post('/v1/groups/join').set(b.auth).send({ code: g.body.inviteCode.toLowerCase(), payoutPhone: '0971234567' });
    assert.equal(r1.status, 200);
    const r2 = await t.agent.post('/v1/groups/join').set(c.auth).send({ code: g.body.inviteCode, payoutPhone: '0851234567' });
    assert.equal(r2.body.members.length, 3);
    assert.equal(r2.body.pot, 100);
    const extra = await t.login('0901234567', 'Dédé');
    const r3 = await t.agent.post('/v1/groups/join').set(extra.auth).send({ code: g.body.inviteCode, payoutPhone: '0901234567' });
    assert.equal(r3.status, 409);
    assert.equal(r3.body.error.code, 'group_full');
  });

  test('seul l\'admin démarre, et un tour est créé par membre', async () => {
    const no = await t.agent.post(`/v1/groups/${groupId}/start`).set(b.auth).send({});
    assert.equal(no.status, 403);
    const r = await t.agent.post(`/v1/groups/${groupId}/start`).set(a.auth).send({ order: 'join' });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'active');
    assert.equal(r.body.cycles.length, 3);
    assert.equal(r.body.cycles[1].dueDate, '2030-02-05');
    assert.equal(r.body.currentCycle.beneficiaryId, a.user.id);
    assert.equal(r.body.currentCycle.expectedCount, 2);
  });

  test('le bénéficiaire du tour ne cotise pas', async () => {
    const r = await t.agent.post(`/v1/groups/${groupId}/contributions`).set(a.auth).send({ phone: '0812345678' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'is_beneficiary');
  });

  test('cotisation : demande Mobile Money puis confirmation par callback', async () => {
    const r = await t.agent.post(`/v1/groups/${groupId}/contributions`).set(b.auth).send({ phone: '0971234567' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.status, 'pending');
    assert.equal(r.body.method, 'airtel');
    const tx = t.psp.txs.get(r.body.reference);
    assert.equal(tx.action, 'debit');
    assert.equal(tx.amount, 50);
    assert.equal(tx.callbackUrl, 'https://api.test/webhooks/awa');

    // un double appui ne crée pas un second paiement
    const again = await t.agent.post(`/v1/groups/${groupId}/contributions`).set(b.auth).send({ phone: '0971234567' });
    assert.equal(again.body.reference, r.body.reference);

    const cb = await t.callback(r.body.reference, 'Success');
    assert.equal(cb.status, 200);
    const s = await t.agent.get(`/v1/contributions/${r.body.id}`).set(b.auth);
    assert.equal(s.body.status, 'success');
    // callback rejoué : idempotent
    await t.callback(r.body.reference, 'Failed');
    const s2 = await t.agent.get(`/v1/contributions/${r.body.id}`).set(b.auth);
    assert.equal(s2.body.status, 'success');

    const dup = await t.agent.post(`/v1/groups/${groupId}/contributions`).set(b.auth).send({ phone: '0971234567' });
    assert.equal(dup.body.error.code, 'already_paid');
  });

  test('paiement échoué : le membre peut réessayer', async () => {
    const r = await t.agent.post(`/v1/groups/${groupId}/contributions`).set(c.auth).send({ phone: '0851234567' });
    await t.callback(r.body.reference, 'Failed');
    const s = await t.agent.get(`/v1/contributions/${r.body.id}`).set(c.auth);
    assert.equal(s.body.status, 'failed');
    const retry = await t.agent.post(`/v1/groups/${groupId}/contributions`).set(c.auth).send({ phone: '0851234567', method: 'orange' });
    assert.equal(retry.status, 201);
    await t.callback(retry.body.reference, 'Success');
    const g = await t.agent.get(`/v1/groups/${groupId}`).set(a.auth);
    assert.equal(g.body.currentCycle.status, 'ready');
    assert.equal(g.body.currentCycle.paidCount, 2);
  });

  test('versement : demande, règlement, validation par la finance, tour suivant', async () => {
    const no = await t.agent.post(`/v1/groups/${groupId}/cycles/1/payout-request`).set(b.auth);
    assert.equal(no.status, 403);
    const r = await t.agent.post(`/v1/groups/${groupId}/cycles/1/payout-request`).set(a.auth);
    assert.equal(r.status, 201);
    const fin = await t.login('0899999999', 'Finance Ikobi'); // admin via PLATFORM_ADMIN_PHONES
    const refs = (await t.db('contributions').where({ status: 'success' })).map((x) => x.reference);
    const st = await t.agent.post('/v1/ops/settlements').set(fin.auth).send({ provider: 'awa', currency: 'USD', references: refs, statementTotal: 100 });
    assert.equal(st.status, 200, JSON.stringify(st.body));
    const ok = await t.agent.post(`/v1/ops/payout-requests/${r.body.id}/review`).set(fin.auth).send({ decision: 'approve' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const tx = t.psp.txs.get(ok.body.reference);
    assert.equal(tx.action, 'credit');
    assert.equal(tx.amount, 100);
    assert.equal(tx.phone, '243812345678');
    await t.callback(ok.body.reference, 'Success');
    const g = await t.agent.get(`/v1/groups/${groupId}`).set(a.auth);
    assert.equal(g.body.currentCycle.number, 2);
    assert.equal(g.body.currentCycle.beneficiaryId, b.user.id);
    assert.equal(g.body.cycles[0].status, 'closed');
    assert.equal(g.body.me.payoutReceived, 100);
    const h = await t.agent.get(`/v1/groups/${groupId}/history`).set(c.auth);
    assert.equal(h.body.contributions.length, 2);
    assert.equal(h.body.payouts[0].status, 'success');
  });

  test('un non-membre ne voit pas le groupe', async () => {
    const x = await t.login('0821111111', 'Intrus');
    const r = await t.agent.get(`/v1/groups/${groupId}`).set(x.auth);
    assert.equal(r.status, 403);
  });

  test('suppression du compte : bloquée pendant une tontine, possible sinon', async () => {
    const blocked = await t.agent.delete('/v1/me').set(b.auth);
    assert.equal(blocked.status, 409);
    const x = await t.login('0822222222', 'Libre');
    const ok = await t.agent.delete('/v1/me').set(x.auth);
    assert.equal(ok.status, 204);
    const after = await t.agent.get('/v1/me').set(x.auth);
    assert.equal(after.status, 401);
  });

  test('sans jeton : 401', async () => {
    const r = await t.agent.get('/v1/groups');
    assert.equal(r.status, 401);
  });
});
