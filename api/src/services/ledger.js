// Grand livre en partie double, en ajout seul.
//
// Comptes (par devise) :
//   clearing:<provider>  actif   — encaissé chez le fournisseur, pas encore réglé sur le compte marchand
//   cash:<provider>      actif   — fonds réglés sur le compte marchand
//   pool:<groupId>       passif  — fonds détenus pour le compte d'une tontine
//   revenue:fees         produit — frais Ikobi
//
// Règle : chaque journal est équilibré (Σ débits = Σ crédits) et unique par (kind, ref_type, ref_id),
// ce qui rend les écritures idempotentes face aux callbacks rejoués.

import { insertId } from '../db.js';

export function createLedger({ db }) {
  async function post({ kind, refType, refId, currency, memo = '', lines }, trx = db) {
    const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
    const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
    if (debit !== credit || debit <= 0) throw new Error(`Journal déséquilibré (${kind} ${refId}) : ${debit} ≠ ${credit}`);
    if (lines.some((l) => (l.debit || 0) < 0 || (l.credit || 0) < 0)) throw new Error('Montant négatif interdit');

    const existing = await trx('ledger_journals').where({ kind, ref_type: refType, ref_id: String(refId) }).first();
    if (existing) return { journalId: existing.id, duplicate: true };

    let journalId;
    try {
      journalId = await insertId(trx('ledger_journals').insert({ kind, ref_type: refType, ref_id: String(refId), currency, memo: memo.slice(0, 200) }, ['id']));
    } catch (e) {
      // Course entre deux callbacks : l'autre a déjà écrit.
      const again = await trx('ledger_journals').where({ kind, ref_type: refType, ref_id: String(refId) }).first();
      if (again) return { journalId: again.id, duplicate: true };
      throw e;
    }
    await trx('ledger_entries').insert(
      lines.map((l) => ({ journal_id: journalId, account: l.account, debit_minor: l.debit || 0, credit_minor: l.credit || 0, currency })),
    );
    return { journalId, duplicate: false };
  }

  // Solde « naturel » : débit − crédit (positif pour un actif, négatif pour un passif).
  async function balance(account, currency, trx = db) {
    const r = await trx('ledger_entries').where({ account, currency }).sum({ d: 'debit_minor' }).sum({ c: 'credit_minor' }).first();
    return Number(r.d || 0) - Number(r.c || 0);
  }

  async function trialBalance(trx = db) {
    const rows = await trx('ledger_entries')
      .select('account', 'currency')
      .sum({ d: 'debit_minor' })
      .sum({ c: 'credit_minor' })
      .groupBy('account', 'currency')
      .orderBy('account');
    const accounts = rows.map((r) => ({ account: r.account, currency: r.currency, debit: Number(r.d), credit: Number(r.c), balance: Number(r.d) - Number(r.c) }));
    const totals = {};
    for (const a of accounts) {
      totals[a.currency] ??= { debit: 0, credit: 0 };
      totals[a.currency].debit += a.debit;
      totals[a.currency].credit += a.credit;
    }
    const balanced = Object.values(totals).every((t) => t.debit === t.credit);
    return { accounts, totals, balanced };
  }

  return { post, balance, trialBalance };
}
