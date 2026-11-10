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

// V3 — Phase 1 : intégrité financière. Uniquement des AJOUTS (aucune donnée supprimée).
migrations.push({
  id: '002_financial_core',
  async up(knex) {
    // Grand livre en partie double, en ajout seul (jamais de UPDATE/DELETE applicatif).
    await knex.schema.createTable('ledger_journals', (t) => {
      t.increments('id').primary();
      t.string('kind', 30).notNullable(); // contribution_collected | settlement | payout | fee …
      t.string('ref_type', 20).notNullable();
      t.string('ref_id', 60).notNullable();
      t.string('currency', 3).notNullable();
      t.string('memo', 200).notNullable().defaultTo('');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.unique(['kind', 'ref_type', 'ref_id']); // idempotence : une écriture par événement
    });
    await knex.schema.createTable('ledger_entries', (t) => {
      t.increments('id').primary();
      t.integer('journal_id').unsigned().notNullable().references('ledger_journals.id');
      t.string('account', 60).notNullable().index();
      t.bigInteger('debit_minor').notNullable().defaultTo(0);
      t.bigInteger('credit_minor').notNullable().defaultTo(0);
      t.string('currency', 3).notNullable();
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });

    // Événements bruts des fournisseurs de paiement : anti-rejeu et traçabilité.
    await knex.schema.createTable('provider_events', (t) => {
      t.increments('id').primary();
      t.string('provider', 20).notNullable();
      t.string('reference', 60).nullable().index();
      t.string('event_hash', 64).notNullable().unique();
      t.string('status_reported', 20).nullable();
      t.string('outcome', 30).notNullable(); // applied | duplicate | ignored | rejected | unknown_reference
      t.timestamp('received_at').notNullable().defaultTo(knex.fn.now());
    });

    // Journal d'audit des actions touchant l'argent ou l'identité (ajout seul).
    await knex.schema.createTable('audit_log', (t) => {
      t.increments('id').primary();
      t.integer('actor_id').unsigned().nullable();
      t.string('actor_type', 12).notNullable(); // user | system | provider
      t.string('action', 50).notNullable();
      t.string('entity', 30).notNullable();
      t.string('entity_id', 60).notNullable();
      t.text('data').nullable();
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.index(['entity', 'entity_id']);
    });

    // Règles de frais configurables (pays, fournisseur, opérateur, type de transaction).
    await knex.schema.createTable('fee_rules', (t) => {
      t.increments('id').primary();
      t.string('country', 2).notNullable().defaultTo('*');
      t.string('provider', 20).notNullable().defaultTo('*');
      t.string('method', 12).notNullable().defaultTo('*');
      t.string('tx_type', 12).notNullable(); // contribution | payout
      t.string('currency', 3).notNullable().defaultTo('*');
      t.integer('pct_bp').notNullable().defaultTo(0); // points de base : 300 = 3 %
      t.bigInteger('fixed_minor').notNullable().defaultTo(0);
      t.boolean('active').notNullable().defaultTo(true);
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });

    // Demandes de versement : l'organisateur demande (maker), l'équipe Ikobi approuve (checker).
    await knex.schema.createTable('payout_requests', (t) => {
      t.increments('id').primary();
      t.integer('cycle_id').unsigned().notNullable().references('cycles.id');
      t.integer('requested_by').unsigned().notNullable().references('users.id');
      t.integer('reviewed_by').unsigned().nullable().references('users.id');
      t.string('status', 12).notNullable().defaultTo('requested'); // requested | approved | rejected | executed
      t.string('review_note', 200).nullable();
      t.timestamps(true, true);
    });

    await knex.schema.alterTable('users', (t) => {
      t.string('platform_role', 12).nullable(); // ops | finance | compliance | admin
      t.string('kyc_status', 12).notNullable().defaultTo('none'); // none | pending | verified | rejected
    });
    await knex.schema.alterTable('groups', (t) => {
      t.string('country', 2).notNullable().defaultTo('CD');
    });
    await knex.schema.alterTable('contributions', (t) => {
      t.string('provider', 20).notNullable().defaultTo('moko');
      t.bigInteger('fee_minor').notNullable().defaultTo(0);
      t.string('settlement_status', 10).notNullable().defaultTo('unsettled'); // unsettled | settled
      t.timestamp('settled_at').nullable();
    });
    await knex.schema.alterTable('payouts', (t) => {
      t.string('provider', 20).notNullable().defaultTo('moko');
      t.bigInteger('fee_minor').notNullable().defaultTo(0);
      t.integer('request_id').unsigned().nullable();
    });
  },
});

// Portail développeurs : demandes de clé et clés partenaires (ajouts uniquement).
migrations.push({
  id: '003_developer_portal',
  async up(knex) {
    await knex.schema.createTable('api_key_requests', (t) => {
      t.increments('id').primary();
      t.string('org_name', 120).notNullable();
      t.string('org_type', 20).notNullable();
      t.string('country', 2).notNullable();
      t.string('contact_name', 80).notNullable();
      t.string('email', 160).notNullable();
      t.string('phone', 20).nullable();
      t.string('website', 200).nullable();
      t.text('use_case').notNullable();
      t.string('volume', 20).nullable();
      t.string('status', 12).notNullable().defaultTo('requested'); // requested | approved | rejected
      t.integer('reviewed_by').unsigned().nullable();
      t.string('review_note', 200).nullable();
      t.string('ip_hash', 64).nullable();
      t.timestamps(true, true);
      t.index(['email']);
    });
    await knex.schema.createTable('api_keys', (t) => {
      t.increments('id').primary();
      t.integer('request_id').unsigned().nullable().references('api_key_requests.id');
      t.string('partner_name', 120).notNullable();
      t.string('prefix', 16).notNullable();
      t.string('key_hash', 64).notNullable().unique();
      t.string('scopes', 200).notNullable().defaultTo('insights:read');
      t.string('status', 10).notNullable().defaultTo('active'); // active | revoked
      t.timestamp('last_used_at').nullable();
      t.timestamps(true, true);
    });
  },
});

// Frais : deux composantes (service iKobi / frais de paiement) et grille validée le 10/11/2026.
migrations.push({
  id: '004_fee_components',
  async up(knex) {
    await knex.schema.alterTable('fee_rules', (t) => {
      t.string('component', 12).notNullable().defaultTo('processing'); // processing | service
    });
    await knex.schema.alterTable('contributions', (t) => {
      t.bigInteger('service_fee_minor').notNullable().defaultTo(0);
    });
    await knex.schema.alterTable('payouts', (t) => {
      t.bigInteger('service_fee_minor').notNullable().defaultTo(0);
    });
    // Grille validée par le fondateur : dépôt 3,5 % (paiement), retrait 3 % (paiement) + 2 % (service iKobi).
    await knex('fee_rules').insert([
      { tx_type: 'contribution', component: 'processing', pct_bp: 350 },
      { tx_type: 'payout', component: 'processing', pct_bp: 300 },
      { tx_type: 'payout', component: 'service', pct_bp: 200 },
    ]);
  },
});

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
