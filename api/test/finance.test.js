// Scénarios critiques du cahier des charges V3 : intégrité financière.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

async function activeGroup(t, { amount = 50, members = 3 } = {}) {
  const phones = ['0812000001', '0972000002', '0852000003', '0902000004'].slice(0, members);
  const users = [];
  for (const [i, p] of phones.entries()) users.push(await t.login(p, `Membre ${i + 1}`));
  const g = await t.agent.post('/v1/groups').set(users[0].auth).send({
    name: 'Cercle test', amount, currency: 'USD', frequency: 'monthly', maxMembers: members, startDate: '2030-01-01', payoutPhone: phones[0],
  });
  for (let i = 1; i < members; i++) await t.agent.post('/v1/groups/join').set(users[i].auth).send({ code: g.body.inviteCode, payoutPhone: phones[i] });
  await t.agent.post(`/v1/groups/${g.body.id}/start`).set(users[0].auth).send({});
  return { gid: g.body.id, users, phones };
}

async function payAll(t, gid, users, phones) {
  const refs = [];
  for (let i = 1; i < users.length; i++) {
    const r = await t.agent.post(`/v1/groups/${gid}/contributions`).set(users[i].auth).send({ phone: phones[i] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    await t.callback(r.body.reference, 'Success');
    refs.push(r.body.reference);
  }
  return refs;
}

describe('intégrité financière', () => {
  let t, fin;
  before(async () => {
    t = await setup();
    fin = await t.login('0899999999', 'Finance');
  });
  after(() => t.close());

  test('frais : 3 % affichés avant paiement, prélevés en plus, grand livre équilibré', async () => {
    await t.db('fee_rules').insert({ tx_type: 'contribution', pct_bp: 300 });
    const { gid, users, phones } = await activeGroup(t);
    const q = await t.agent.get(`/v1/groups/${gid}/contributions/quote?method=airtel`).set(users[1].auth);
    assert.deepEqual([q.body.principal, q.body.fee, q.body.total], [50, 1.5, 51.5]);
    const r = await t.agent.post(`/v1/groups/${gid}/contributions`).set(users[1].auth).send({ phone: phones[1] });
    assert.equal(r.body.total, 51.5);
    assert.equal(t.psp.txs.get(r.body.reference).amount, 51.5); // montant réellement demandé
    await t.callback(r.body.reference, 'Success');
    const rec = await t.agent.get('/v1/ops/reconciliation').set(fin.auth);
    assert.equal(rec.body.ledgerBalanced, true);
    const fees = rec.body.accounts.find((a) => a.account === 'revenue:fees');
    assert.equal(fees.balance, -1.5);
    await t.db('fee_rules').del();
  });

  test('callback dupliqué ou rejoué : une seule écriture comptable', async () => {
    const { gid, users, phones } = await activeGroup(t);
    const r = await t.agent.post(`/v1/groups/${gid}/contributions`).set(users[1].auth).send({ phone: phones[1] });
    const first = await t.callback(r.body.reference, 'Success');
    const dup = await t.callback(r.body.reference, 'Success');
    assert.equal(first.status, 200);
    assert.equal(dup.body.duplicate, true);
    await t.callback(r.body.reference, 'Failed'); // échec tardif après succès : ignoré
    const journals = await t.db('ledger_journals').where({ ref_id: r.body.reference });
    assert.equal(journals.length, 1);
    const c = await t.db('contributions').where({ reference: r.body.reference }).first();
    assert.equal(c.status, 'success');
  });

  test('callback avec un montant différent : rien n’est crédité, alerte tracée', async () => {
    const { gid, users, phones } = await activeGroup(t);
    const r = await t.agent.post(`/v1/groups/${gid}/contributions`).set(users[1].auth).send({ phone: phones[1] });
    const res = await t.callback(r.body.reference, 'Success', { amount: 1 });
    assert.equal(res.status, 200);
    const c = await t.db('contributions').where({ reference: r.body.reference }).first();
    assert.equal(c.status, 'pending');
    assert.ok(await t.db('audit_log').where({ action: 'callback.amount_mismatch' }).first());
    const ok = await t.callback(r.body.reference, 'Success', { amount: 50 });
    assert.equal(ok.status, 200);
    assert.equal((await t.db('contributions').where({ reference: r.body.reference }).first()).status, 'success');
  });

  test('callback pour une référence inconnue : tracé, sans effet', async () => {
    const res = await t.callback('IKC-INCONNU-0000', 'Success');
    assert.equal(res.status, 200);
    const ev = await t.db('provider_events').where({ reference: 'IKC-INCONNU-0000' }).first();
    assert.equal(ev.outcome, 'unknown_reference');
  });

  test('paiement en attente ancien : jamais marqué échoué à l’aveugle', async () => {
    const { gid, users, phones } = await activeGroup(t);
    const r = await t.agent.post(`/v1/groups/${gid}/contributions`).set(users[1].auth).send({ phone: phones[1] });
    await t.db('contributions').where({ reference: r.body.reference }).update({ created_at: new Date(Date.now() - 10 * 60 * 1000) });
    const again = await t.agent.post(`/v1/groups/${gid}/contributions`).set(users[1].auth).send({ phone: phones[1] });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'payment_unconfirmed');
    const c = await t.db('contributions').where({ reference: r.body.reference }).first();
    assert.equal(c.status, 'pending');
  });

  test('versement bloqué tant que les fonds ne sont pas réglés ; relevé faux refusé', async () => {
    const { gid, users, phones } = await activeGroup(t);
    const refs = await payAll(t, gid, users, phones);
    const req = await t.agent.post(`/v1/groups/${gid}/cycles/1/payout-request`).set(users[0].auth);
    assert.equal(req.status, 201);
    const dupReq = await t.agent.post(`/v1/groups/${gid}/cycles/1/payout-request`).set(users[0].auth);
    assert.equal(dupReq.status, 409);

    const early = await t.agent.post(`/v1/ops/payout-requests/${req.body.id}/review`).set(fin.auth).send({ decision: 'approve' });
    assert.equal(early.status, 409);
    assert.match(early.body.error.message, /réglées/);

    const wrong = await t.agent.post('/v1/ops/settlements').set(fin.auth).send({ provider: 'awa', currency: 'USD', references: refs, statementTotal: 99 });
    assert.equal(wrong.status, 409);
    assert.equal((await t.db('contributions').whereIn('reference', refs).where({ settlement_status: 'settled' })).length, 0);
    const disc = await t.db('audit_log').where({ action: 'settlement.discrepancy' }).first();
    assert.ok(disc);

    const good = await t.agent.post('/v1/ops/settlements').set(fin.auth).send({ provider: 'awa', currency: 'USD', references: refs, statementTotal: 100 });
    assert.equal(good.status, 200);
    const twice = await t.agent.post('/v1/ops/settlements').set(fin.auth).send({ provider: 'awa', currency: 'USD', references: refs, statementTotal: 100 });
    assert.equal(twice.status, 409); // déjà réglées
  });

  test('versements concurrents : un seul exécuté ; frais de retrait déduits ; tontine soldée', async () => {
    await t.db('fee_rules').insert({ tx_type: 'payout', pct_bp: 280 });
    const { gid, users, phones } = await activeGroup(t);
    const refs = await payAll(t, gid, users, phones);
    await t.agent.post('/v1/ops/settlements').set(fin.auth).send({ provider: 'awa', currency: 'USD', references: refs, statementTotal: 100 });
    const req = await t.agent.post(`/v1/groups/${gid}/cycles/1/payout-request`).set(users[0].auth);
    const [x, y] = await Promise.all([
      t.agent.post(`/v1/ops/payout-requests/${req.body.id}/review`).set(fin.auth).send({ decision: 'approve' }),
      t.agent.post(`/v1/ops/payout-requests/${req.body.id}/review`).set(fin.auth).send({ decision: 'approve' }),
    ]);
    const okCount = [x, y].filter((r) => r.status === 200).length;
    assert.equal(okCount, 1);
    const cycle = await t.db('cycles').where({ group_id: gid, number: 1 }).first();
    const payouts = await t.db('payouts').where({ cycle_id: cycle.id });
    assert.equal(payouts.length, 1);
    const tx = t.psp.txs.get(payouts[0].reference);
    assert.equal(tx.amount, 97.2); // 100 − 2,8 %
    await t.callback(payouts[0].reference, 'Success');
    const pool = await t.services.ledger.balance(`pool:${gid}`, 'USD');
    assert.equal(pool, 0);
    const tb = await t.services.ledger.trialBalance();
    assert.equal(tb.balanced, true);
    await t.db('fee_rules').del();
  });

  test('séparation des tâches : pas d’auto-validation, rôles exigés', async () => {
    const { gid, users, phones } = await activeGroup(t);
    await payAll(t, gid, users, phones);
    const req = await t.agent.post(`/v1/groups/${gid}/cycles/1/payout-request`).set(users[0].auth);
    const member = await t.agent.post(`/v1/ops/payout-requests/${req.body.id}/review`).set(users[1].auth).send({ decision: 'approve' });
    assert.equal(member.status, 403);
    const recon = await t.agent.get('/v1/ops/reconciliation').set(users[1].auth);
    assert.equal(recon.status, 403);
    // l'organisateur promu admin ne peut pas valider sa propre demande
    await t.db('users').where({ id: users[0].user.id }).update({ platform_role: 'finance' });
    const self = await t.agent.post(`/v1/ops/payout-requests/${req.body.id}/review`).set(users[0].auth).send({ decision: 'approve' });
    assert.equal(self.status, 403);
    const rej = await t.agent.post(`/v1/ops/payout-requests/${req.body.id}/review`).set(fin.auth).send({ decision: 'reject', note: 'Vérification identité' });
    assert.equal(rej.body.status, 'rejected');
    const audit = await t.db('audit_log').where({ action: 'payout.rejected' });
    assert.equal(audit.length, 1);
  });

  test('échec du versement : tour remis en attente, nouvelle demande possible', async () => {
    const { gid, users, phones } = await activeGroup(t);
    const refs = await payAll(t, gid, users, phones);
    await t.agent.post('/v1/ops/settlements').set(fin.auth).send({ provider: 'awa', currency: 'USD', references: refs, statementTotal: 100 });
    const req = await t.agent.post(`/v1/groups/${gid}/cycles/1/payout-request`).set(users[0].auth);
    const ok = await t.agent.post(`/v1/ops/payout-requests/${req.body.id}/review`).set(fin.auth).send({ decision: 'approve' });
    await t.callback(ok.body.reference, 'Failed');
    const cycle = await t.db('cycles').where({ group_id: gid, number: 1 }).first();
    assert.equal(cycle.status, 'ready');
    assert.equal(await t.services.ledger.balance(`pool:${gid}`, 'USD'), -10000); // fonds toujours dans la tontine
    const again = await t.agent.post(`/v1/groups/${gid}/cycles/1/payout-request`).set(users[0].auth);
    assert.equal(again.status, 201);
  });
});
