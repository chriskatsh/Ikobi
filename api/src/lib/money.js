// Montants stockés en unités mineures (centimes) pour éviter les erreurs d'arrondi.
export const CURRENCIES = ['USD', 'CDF'];

export function toMinor(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function fromMinor(minor) {
  return Number((minor / 100).toFixed(2));
}

export function formatMoney(minor, currency) {
  const v = fromMinor(minor);
  const s = currency === 'CDF'
    ? Math.round(v).toLocaleString('fr-FR').replace(/ | /g, ' ')
    : v.toFixed(2).replace(/\.00$/, '');
  return currency === 'USD' ? `${s} $` : `${s} FC`;
}
