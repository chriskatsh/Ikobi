import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup } from './helpers.js';
import { createSetupApp } from '../src/app.js';

const valid = {
  orgName: 'Coopérative des mamans de Matete',
  orgType: 'cooperative',
  country: 'cd',
  contactName: 'Mama Nsimba',
  email: 'contact@coop-matete.example',
  useCase: 'Suivre l’épargne de nos 12 groupes de commerçantes et leur proposer un accompagnement.',
  volume: '100-1000',
  consent: true,
};

describe('portail développeurs', () => {
  let t, admin;
  before(async () => {
    t = await setup();
    admin = await t.login('0899999999', 'Admin');
  });
  after(() => t.close());

  test('le portail HTML est servi à la racine avec une CSP stricte', async () => {
    const r = await t.agent.get('/');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /html/);
    assert.match(r.headers['content-security-policy'], /script-src 'self'/);
  });

  test('demande de clé : validation, robot, enregistrement', async () => {
    const bad = await t.agent.post('/v1/developers/key-requests').send({ ...valid, email: 'pas-un-email', useCase: 'trop court' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.details.length >= 2);
    const noConsent = await t.agent.post('/v1/developers/key-requests').send({ ...valid, consent: false });
    assert.equal(noConsent.status, 400);
    const bot = await t.agent.post('/v1/developers/key-requests').send({ ...valid, company: 'spam' });
    assert.equal(bot.status, 400);
    const ok = await t.agent.post('/v1/developers/key-requests').send(valid);
    assert.equal(ok.status, 201);
    assert.equal(ok.body.status, 'requested');
    const row = await t.db('api_key_requests').where({ id: ok.body.id }).first();
    assert.equal(row.country, 'CD');
  });

  test('approbation par un admin : clé affichée une fois, seule l’empreinte est stockée', async () => {
    const req = await t.db('api_key_requests').first();
    const member = await t.login('0812345678', 'Membre');
    const denied = await t.agent.post(`/v1/ops/api-key-requests/${req.id}/approve`).set(member.auth).send({});
    assert.equal(denied.status, 403);
    const r = await t.agent.post(`/v1/ops/api-key-requests/${req.id}/approve`).set(admin.auth).send({});
    assert.equal(r.status, 201);
    assert.match(r.body.apiKey, /^ikb_live_/);
    const stored = await t.db('api_keys').first();
    assert.notEqual(stored.key_hash, r.body.apiKey);
    assert.ok(!JSON.stringify(stored).includes(r.body.apiKey));
    const twice = await t.agent.post(`/v1/ops/api-key-requests/${req.id}/approve`).set(admin.auth).send({});
    assert.equal(twice.status, 409);

    // API partenaire
    const ping = await t.agent.get('/partner/v1/ping').set('Authorization', `Bearer ${r.body.apiKey}`);
    assert.equal(ping.status, 200);
    assert.equal(ping.body.partner, valid.orgName);
    const viaHeader = await t.agent.get('/partner/v1/ping').set('X-API-Key', r.body.apiKey);
    assert.equal(viaHeader.status, 200);
    const noKey = await t.agent.get('/partner/v1/insights');
    assert.equal(noKey.status, 401);
    const ins = await t.agent.get('/partner/v1/insights').set('Authorization', `Bearer ${r.body.apiKey}`);
    assert.equal(ins.status, 200);
    assert.equal(ins.body.available, false); // moins de 5 communautés : rien n'est publié
    assert.ok(!JSON.stringify(ins.body).includes('243'));

    // Révocation
    const keys = await t.agent.get('/v1/ops/api-keys').set(admin.auth);
    const rev = await t.agent.post(`/v1/ops/api-keys/${keys.body[0].id}/revoke`).set(admin.auth);
    assert.equal(rev.status, 200);
    const after = await t.agent.get('/partner/v1/ping').set('Authorization', `Bearer ${r.body.apiKey}`);
    assert.equal(after.status, 401);
    assert.ok(await t.db('audit_log').where({ action: 'api_key.revoked' }).first());
  });

  test('statistiques publiées à partir de 5 communautés, sans données personnelles', async () => {
    const owner = await t.login('0812000999', 'Organisatrice');
    for (let i = 0; i < 5; i++) {
      await t.agent.post('/v1/groups').set(owner.auth).send({ name: `Cercle ${i}`, amount: 10000, currency: 'CDF', frequency: 'weekly', maxMembers: 5, startDate: '2030-01-01', payoutPhone: '0812000999' });
    }
    const req = await t.agent.post('/v1/developers/key-requests').send({ ...valid, email: 'autre@exemple.cd' });
    const k = await t.agent.post(`/v1/ops/api-key-requests/${req.body.id}/approve`).set(admin.auth).send({});
    const ins = await t.agent.get('/partner/v1/insights').set('Authorization', `Bearer ${k.body.apiKey}`);
    assert.equal(ins.body.available, true);
    assert.ok(ins.body.communities.total >= 5);
    const text = JSON.stringify(ins.body);
    assert.ok(!text.includes('Organisatrice') && !text.includes('243'));
  });

  test('mode configuration incomplète : portail et demandes de clé actifs, paiements fermés', async () => {
    const app = createSetupApp({ db: t.db, config: { ...t.config, missing: ['AWA_SECRET_KEY'] }, logger: { error() {} } });
    const a = request(app);
    assert.equal((await a.get('/')).status, 200);
    const h = await a.get('/v1/health');
    assert.equal(h.status, 503);
    assert.deepEqual(h.body.missing, ['AWA_SECRET_KEY']);
    const k = await a.post('/v1/developers/key-requests').send({ ...valid, email: 'setup@exemple.cd' });
    assert.equal(k.status, 201);
    assert.equal((await a.post('/v1/groups').send({})).status, 503);
    assert.equal((await a.post('/webhooks/awa').send({})).status, 503);
  });
});
