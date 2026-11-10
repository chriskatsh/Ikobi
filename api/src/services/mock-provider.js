// Faux fournisseur de paiement pour le développement et les tests : aucune somme réelle ne circule.
// Interdit en production (voir main.js).
export function createMockProvider({ currencies = ['CDF', 'USD'] } = {}) {
  const txs = new Map();
  let n = 0;
  const start = (action) => async (p) => {
    if (!currencies.includes(p.currency)) return { accepted: false, errorCode: 'currency', error: 'Devise non prise en charge' };
    if (p.phone?.endsWith('0000402')) return { accepted: false, errorCode: 402, error: 'Solde insuffisant' };
    const id = `MOCK-${++n}`;
    txs.set(p.reference, { action, status: 'pending', providerTxId: id, ...p });
    return { accepted: true, providerTxId: id, finalStatus: 'pending' };
  };
  return {
    name: 'mock',
    isMock: true,
    currencies,
    txs,
    debit: start('debit'),
    credit: start('credit'),
    async verify(reference) {
      const t = txs.get(reference);
      return t ? { status: t.status, providerTxId: t.providerTxId } : { status: 'pending' };
    },
    parseCallback(rawBody) {
      const b = JSON.parse(rawBody);
      const d = b.data && typeof b.data === 'object' ? b.data : b;
      const s = String(d.status ?? d.Trans_Status ?? '').toLowerCase();
      return {
        reference: d.order_id || d.Reference || d.reference,
        status: s === 'success' || s === '2' ? 'success' : s === 'failed' || s === '3' || s === '4' ? 'failed' : 'pending',
        providerTxId: d.transaction_id || null,
        amount: d.amount,
      };
    },
    settle(reference, status = 'success') {
      const t = txs.get(reference);
      if (t) t.status = status;
      return t;
    },
  };
}
