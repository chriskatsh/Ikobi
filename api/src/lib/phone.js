// Numéros de téléphone RDC : format canonique 243XXXXXXXXX (12 chiffres, sans +).

const PREFIX_TO_METHOD = {
  '81': 'mpesa', '82': 'mpesa', '83': 'mpesa',
  '84': 'orange', '85': 'orange', '89': 'orange', '80': 'orange',
  '97': 'airtel', '98': 'airtel', '99': 'airtel',
  '90': 'africell', '91': 'africell',
};

export const METHODS = {
  mpesa: 'M-Pesa',
  orange: 'Orange Money',
  airtel: 'Airtel Money',
  africell: 'Afrimoney',
};

export function normalizePhone(input) {
  if (input === undefined || input === null) return null;
  let d = String(input).replace(/[^\d]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 10) d = '243' + d.slice(1);
  if (d.length === 9) d = '243' + d;
  if (!/^243\d{9}$/.test(d)) return null;
  return d;
}

export function detectMethod(phone) {
  const p = normalizePhone(phone);
  if (!p) return null;
  return PREFIX_TO_METHOD[p.slice(3, 5)] || null;
}

export function maskPhone(phone) {
  const p = String(phone || '');
  return p.length > 6 ? `+${p.slice(0, 3)} ••• ${p.slice(-4)}` : p;
}
