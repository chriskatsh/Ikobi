import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrations/index.js';
import { createApp } from '../src/app.js';
import { createMockMoko } from '../src/services/moko.js';
import { createMockWhatsApp } from '../src/services/whatsapp.js';

const silent = { info() {}, warn() {}, error() {} };

export async function setup(overrides = {}) {
  const config = loadConfig({
    nodeEnv: 'test',
    isProd: false,
    publicUrl: 'https://api.test',
    otpDebug: true,
    db: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    ...overrides,
  });
  const db = createDb(config.db);
  await migrate(db);
  const moko = createMockMoko();
  const whatsapp = createMockWhatsApp();
  const pushes = [];
  const fetchImpl = async (_url, opts) => {
    pushes.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({}) };
  };
  const { buildServices } = await import('../src/app.js');
  const services = buildServices({ db, config, moko, whatsapp, fetchImpl, logger: silent });
  const { app } = createApp({ db, config, moko, whatsapp, services, logger: silent });
  const agent = request(app);

  async function login(phone, name) {
    const r1 = await agent.post('/v1/auth/otp/request').send({ phone });
    const r2 = await agent.post('/v1/auth/otp/verify').send({ phone, code: r1.body.debugCode, name });
    return { token: r2.body.token, user: r2.body.user, auth: { Authorization: `Bearer ${r2.body.token}` } };
  }

  async function callback(reference, status = 'Success') {
    return agent.post('/webhooks/moko').send({ data: { Reference: reference, Trans_Status: status } });
  }

  return { db, config, moko, whatsapp, services, app, agent, login, callback, pushes, close: () => db.destroy() };
}

export function waMessage(from, { text, replyId, name = 'Testeur', id } = {}) {
  const m = { from, id: id || `wamid.${Math.random().toString(36).slice(2)}` };
  if (replyId) {
    m.type = 'interactive';
    m.interactive = replyId.startsWith('pay:group:')
      ? { type: 'list_reply', list_reply: { id: replyId, title: '' } }
      : { type: 'button_reply', button_reply: { id: replyId, title: '' } };
  } else {
    m.type = 'text';
    m.text = { body: text };
  }
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name } }], messages: [m] } }] }] };
}
