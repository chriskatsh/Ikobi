// Dates d'échéance au format YYYY-MM-DD, calculées en UTC pour rester stables.

export function today(now = new Date()) {
  // Fuseau de Kinshasa (UTC+1) pour la notion de « jour ».
  const k = new Date(now.getTime() + 60 * 60 * 1000);
  return k.toISOString().slice(0, 10);
}

export function addPeriods(dateStr, frequency, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (frequency === 'weekly') dt.setUTCDate(dt.getUTCDate() + 7 * n);
  else if (frequency === 'biweekly') dt.setUTCDate(dt.getUTCDate() + 14 * n);
  else {
    // mensuel : on garde le même jour, borné à la fin du mois
    const targetMonth = dt.getUTCMonth() + n;
    const last = new Date(Date.UTC(dt.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
    dt.setUTCDate(1);
    dt.setUTCMonth(targetMonth);
    dt.setUTCDate(Math.min(d, last));
  }
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

export function formatDateFr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${d} ${mois[m - 1]} ${y}`;
}

// Convertit un horodatage venant de la base en millisecondes.
// SQLite renvoie « YYYY-MM-DD HH:MM:SS » (UTC, sans fuseau) ; MySQL renvoie un objet Date.
export function toMs(v) {
  if (v === null || v === undefined) return NaN;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) ? Date.parse(s.replace(' ', 'T') + 'Z') : Date.parse(s);
}
