// Migrations versionnées, exécutées au démarrage (idempotentes).

const migrations = [
  {
    id: '001_init',
    async up(knex) {
      await knex.schema.createTable('users', (t) => {
        t.increments('id').primary();
        t.string('phone', 16).notNullable().unique();
        t.string('name', 80).notNullable().defaultTo('');
        t.string('push_token', 200).nullable();
        t.timestamp('wa_last_inbound_at').nullable(); // fenêtre de 24 h WhatsApp
        t.timestamps(true, true);
      });

      await knex.schema.createTable('otp_codes', (t) => {
        t.increments('id').primary();
        t.string('phone', 16).notNullable().index();
        t.string('code_hash', 64).notNullable();
        t.integer('attempts').notNullable().defaultTo(0);
        t.timestamp('expires_at').notNullable();
        t.timestamp('used_at').nullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      });

      await knex.schema.createTable('groups', (t) => {
        t.increments('id').primary();
        t.string('name', 80).notNullable();
        t.string('description', 280).notNullable().defaultTo('');
        t.bigInteger('amount_minor').notNullable();
        t.string('currency', 3).notNullable();
        t.string('frequency', 12).notNullable(); // weekly | biweekly | monthly
        t.integer('max_members').notNullable();
        t.string('start_date', 10).notNullable();
        t.string('status', 12).notNullable().defaultTo('forming'); // forming | active | completed
        t.string('invite_code', 8).notNullable().unique();
        t.integer('created_by').unsigned().notNullable().references('users.id');
        t.timestamps(true, true);
      });

      await knex.schema.createTable('memberships', (t) => {
        t.increments('id').primary();
        t.integer('group_id').unsigned().notNullable().references('groups.id').onDelete('CASCADE');
        t.integer('user_id').unsigned().notNullable().references('users.id');
        t.string('role', 10).notNullable().defaultTo('member'); // admin | member
        t.integer('position').notNullable();
        t.string('payout_phone', 16).notNullable();
        t.string('payout_method', 12).notNullable();
        t.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());
        t.unique(['group_id', 'user_id']);
      });

      await knex.schema.createTable('cycles', (t) => {
        t.increments('id').primary();
        t.integer('group_id').unsigned().notNullable().references('groups.id').onDelete('CASCADE');
        t.integer('number').notNullable();
        t.string('due_date', 10).notNullable();
        t.integer('beneficiary_id').unsigned().notNullable().references('users.id');
        // open : cotisations en cours ; ready : tout payé ; paying_out ; closed
        t.string('status', 12).notNullable().defaultTo('open');
        t.timestamps(true, true);
        t.unique(['group_id', 'number']);
      });

      await knex.schema.createTable('contributions', (t) => {
        t.increments('id').primary();
        t.integer('cycle_id').unsigned().notNullable().references('cycles.id').onDelete('CASCADE');
        t.integer('user_id').unsigned().notNullable().references('users.id');
        t.bigInteger('amount_minor').notNullable();
        t.string('currency', 3).notNullable();
        t.string('method', 12).notNullable();
        t.string('phone', 16).notNullable();
        t.string('channel', 10).notNullable().defaultTo('app'); // app | whatsapp
        t.string('status', 10).notNullable().defaultTo('pending'); // pending | success | failed
        t.string('reference', 40).notNullable().unique();
        t.string('provider_tx_id', 80).nullable();
        t.string('failure_reason', 200).nullable();
        t.timestamps(true, true);
        t.index(['cycle_id', 'user_id']);
      });

      await knex.schema.createTable('payouts', (t) => {
        t.increments('id').primary();
        t.integer('cycle_id').unsigned().notNullable().references('cycles.id').onDelete('CASCADE');
        t.integer('user_id').unsigned().notNullable().references('users.id');
        t.bigInteger('amount_minor').notNullable();
        t.string('currency', 3).notNullable();
        t.string('method', 12).notNullable();
        t.string('phone', 16).notNullable();
        t.string('status', 10).notNullable().defaultTo('pending');
        t.string('reference', 40).notNullable().unique();
        t.string('provider_tx_id', 80).nullable();
        t.string('failure_reason', 200).nullable();
        t.timestamps(true, true);
      });

      await knex.schema.createTable('wa_sessions', (t) => {
        t.string('phone', 16).primary();
        t.string('state', 30).notNullable().defaultTo('idle');
        t.text('data').nullable();
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      });

      await knex.schema.createTable('wa_inbound', (t) => {
        // déduplication des webhooks WhatsApp (Meta peut renvoyer le même message)
        t.string('message_id', 120).primary();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      });

      await knex.schema.createTable('reminders', (t) => {
        t.increments('id').primary();
        t.integer('cycle_id').unsigned().notNullable().references('cycles.id').onDelete('CASCADE');
        t.integer('user_id').unsigned().notNullable().references('users.id');
        t.string('kind', 12).notNullable(); // before | due | late
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.unique(['cycle_id', 'user_id', 'kind']);
      });
    },
  },
];

export async function migrate(knex) {
  const has = await knex.schema.hasTable('ikobi_migrations');
  if (!has) {
    await knex.schema.createTable('ikobi_migrations', (t) => {
      t.string('id', 60).primary();
      t.timestamp('run_at').notNullable().defaultTo(knex.fn.now());
    });
  }
  const done = new Set((await knex('ikobi_migrations').select('id')).map((r) => r.id));
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await m.up(knex);
    await knex('ikobi_migrations').insert({ id: m.id });
  }
}
