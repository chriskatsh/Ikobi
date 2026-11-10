import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { normalizePhone, detectMethod } from '../src/lib/phone.js';
import { addPeriods } from '../src/lib/dates.js';
import { encryptMokoPayload, decryptMokoPayload, signMoko, createMokoClient, mapTransStatus } from '../src/services/moko.js';

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

  test('MOKO : chiffrement, signature et statuts', () => {
    const key = '0123456789abcdef';
    const enc = encryptMokoPayload({ Reference: 'IKC-1', Trans_Status: 'Success' }, key);
    assert.deepEqual(decryptMokoPayload(enc, key), { Reference: 'IKC-1', Trans_Status: 'Success' });
    const client = createMokoClient({ baseUrl: 'x', aesKey: key, hmacKey: 'hmac-key' });
    const body = JSON.stringify({ data: enc });
    assert.equal(client.parseCallback(body, signMoko(enc, 'hmac-key')).Reference, 'IKC-1');
    assert.throws(() => client.parseCallback(body, 'mauvaise'), /Signature invalide/);
    assert.equal(mapTransStatus('Successful'), 'success');
    assert.equal(mapTransStatus('Failed'), 'failed');
    assert.equal(mapTransStatus('Pending'), 'pending');
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
    const tx = t.moko.txs.get(r.body.reference);
    assert.equal(tx.action, 'debit');
    assert.equal(tx.amount, 50);
    assert.equal(tx.callbackUrl, 'https://api.test/webhooks/moko');

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

  test('versement de la cagnotte au bénéficiaire puis tour suivant', async () => {
    const no = await t.agent.post(`/v1/groups/${groupId}/cycles/1/payout`).set(b.auth);
    assert.equal(no.status, 403);
    const r = await t.agent.post(`/v1/groups/${groupId}/cycles/1/payout`).set(a.auth);
    assert.equal(r.status, 201);
    const tx = t.moko.txs.get(r.body.reference);
    assert.equal(tx.action, 'credit');
    assert.equal(tx.amount, 100);
    assert.equal(tx.phone, '243812345678');
    await t.callback(r.body.reference, 'Success');
    const g = await t.agent.get(`/v1/groups/${groupId}`).set(a.auth);
    assert.equal(g.body.currentCycle.number, 2);
    assert.equal(g.body.currentCycle.beneficiaryId, b.user.id);
    assert.equal(g.body.cycles[0].status, 'closed');
    const h = await t.agent.get(`/v1/groups/${groupId}/history`).set(c.auth);
    assert.equal(h.body.contributions.length, 2);
    assert.equal(h.body.payouts[0].status, 'success');
  });

  test('un non-membre ne voit pas le groupe', async () => {
    const x = await t.login('0821111111', 'Intrus');
    const r = await t.agent.get(`/v1/groups/${groupId}`).set(x.auth);
    assert.equal(r.status, 403);
  });

  test('sans jeton : 401', async () => {
    const r = await t.agent.get('/v1/groups');
    assert.equal(r.status, 401);
  });
});
