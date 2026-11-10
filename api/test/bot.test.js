import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, waMessage } from './helpers.js';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('chatbot WhatsApp', () => {
  let t, a, b, groupId, code;
  const B = '243971234567';

  before(async () => {
    t = await setup();
    a = await t.login('0812345678', 'Aline');
    b = await t.login('0971234567', 'Ben');
    const g = await t.agent.post('/v1/groups').set(a.auth).send({
      name: 'Tontine Bureau', amount: 20000, currency: 'CDF', frequency: 'weekly', maxMembers: 5, startDate: '2030-03-02', payoutPhone: '0812345678',
    });
    groupId = g.body.id;
    code = g.body.inviteCode;
  });
  after(() => t.close());

  async function send(from, opts) {
    const r = await t.agent.post('/webhooks/whatsapp').send(waMessage(from, opts));
    assert.equal(r.status, 200);
    await wait();
  }

  test('vérification du webhook Meta', async () => {
    const ok = await t.agent.get('/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'dev-verify-token', 'hub.challenge': '42' });
    assert.equal(ok.text, '42');
    const ko = await t.agent.get('/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'faux', 'hub.challenge': '42' });
    assert.equal(ko.status, 403);
  });

  test('inconnu : invitation à rejoindre', async () => {
    await send('243899000111', { text: 'bonjour' });
    assert.match(t.whatsapp.last('243899000111').args[0], /rejoindre/);
  });

  test('rejoindre une tontine par chat crée le compte', async () => {
    await send('243899000111', { text: `rejoindre ${code.toLowerCase()}`, name: 'Papy' });
    assert.match(t.whatsapp.last('243899000111').args[0], /Bienvenue dans \*Tontine Bureau\*/);
    const u = await t.db('users').where({ phone: '243899000111' }).first();
    assert.equal(u.name, 'Papy');
  });

  test('cotiser entièrement en chat', async () => {
    await t.agent.post('/v1/groups/join').set(b.auth).send({ code, payoutPhone: '0971234567' });
    await t.agent.post(`/v1/groups/${groupId}/start`).set(a.auth).send({});

    await send(B, { text: 'Mbote' });
    assert.equal(t.whatsapp.last(B).type, 'buttons');

    await send(B, { replyId: 'menu:pay' });
    const confirm = t.whatsapp.last(B);
    assert.equal(confirm.type, 'buttons');
    assert.match(confirm.args[0], /20 000 FC/);
    assert.equal(confirm.args[1][0].id, 'pay:go:airtel');

    await send(B, { replyId: 'pay:go:airtel' });
    assert.match(t.whatsapp.last(B).args[0], /Demande de paiement envoyée/);
    const contrib = await t.db('contributions').where({ phone: B }).first();
    assert.equal(contrib.channel, 'whatsapp');
    assert.equal(contrib.status, 'pending');

    await t.callback(contrib.reference, 'Success');
    assert.match(t.whatsapp.last(B).args[0], /Cotisation reçue/);

    await send(B, { text: 'cotiser' });
    assert.match(t.whatsapp.last(B).args[0], /à jour/);
  });

  test('statut', async () => {
    await send(B, { text: 'statut' });
    assert.match(t.whatsapp.last(B).args[0], /Tontine Bureau/);
    assert.match(t.whatsapp.last(B).args[0], /Tu as payé/);
  });

  test('bouton de paiement périmé', async () => {
    await send('243899000111', { replyId: 'pay:go:mpesa' });
    assert.match(t.whatsapp.last('243899000111').args[0], /expiré/);
  });

  test('message dupliqué par Meta : traité une seule fois', async () => {
    t.whatsapp.clear();
    await send(B, { text: 'aide', id: 'wamid.DUP' });
    await send(B, { text: 'aide', id: 'wamid.DUP' });
    assert.equal(t.whatsapp.sent.filter((m) => m.to === B).length, 1);
  });

  test('signature Meta exigée quand le secret est configuré', async () => {
    const s = await setup({ whatsapp: { ...t.config.whatsapp, appSecret: 'secret-app' } });
    const body = JSON.stringify(waMessage(B, { text: 'menu' }));
    const bad = await s.agent.post('/webhooks/whatsapp').set('Content-Type', 'application/json').set('X-Hub-Signature-256', 'sha256=00').send(body);
    assert.equal(bad.status, 401);
    const sig = 'sha256=' + crypto.createHmac('sha256', 'secret-app').update(body).digest('hex');
    const good = await s.agent.post('/webhooks/whatsapp').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sig).send(body);
    assert.equal(good.status, 200);
    await s.close();
  });

  test('rappels : envoyés une seule fois par échéance', async () => {
    const now = new Date('2030-03-02T09:00:00Z'); // jour J du premier tour
    const sent1 = await t.services.reminders.runOnce(now);
    const sent2 = await t.services.reminders.runOnce(now);
    assert.ok(sent1 >= 1); // Papy n'a pas payé
    assert.equal(sent2, 0);
  });
});
