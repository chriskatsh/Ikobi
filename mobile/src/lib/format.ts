export function money(amount: number, currency: string) {
  if (currency === 'CDF') {
    return `${Math.round(amount).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} FC`;
  }
  const s = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${s} $`;
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function dateFr(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}

export function todayIso() {
  const k = new Date(Date.now() + 60 * 60 * 1000); // Kinshasa
  return k.toISOString().slice(0, 10);
}

export function daysUntil(iso: string) {
  return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(todayIso() + 'T00:00:00Z')) / 86400000);
}

export function dueLabel(iso: string) {
  const d = daysUntil(iso);
  if (d > 1) return `dans ${d} jours`;
  if (d === 1) return 'demain';
  if (d === 0) return "aujourd'hui";
  return `en retard de ${-d} j`;
}

export const FREQ: Record<string, string> = { weekly: 'Chaque semaine', biweekly: 'Toutes les 2 semaines', monthly: 'Chaque mois' };

// Numéros RDC : 243XXXXXXXXX
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 10) d = '243' + d.slice(1);
  if (d.length === 9) d = '243' + d;
  return /^243\d{9}$/.test(d) ? d : null;
}

const PREFIX: Record<string, string> = {
  '81': 'mpesa', '82': 'mpesa', '83': 'mpesa',
  '84': 'orange', '85': 'orange', '89': 'orange', '80': 'orange',
  '97': 'airtel', '98': 'airtel', '99': 'airtel',
  '90': 'africell', '91': 'africell',
};

export function detectOperator(phone: string): string | null {
  const p = normalizePhone(phone);
  return p ? PREFIX[p.slice(3, 5)] ?? null : null;
}

export function displayPhone(p: string) {
  const n = normalizePhone(p);
  if (!n) return p;
  return `+243 ${n.slice(3, 5)} ${n.slice(5, 8)} ${n.slice(8)}`;
}
