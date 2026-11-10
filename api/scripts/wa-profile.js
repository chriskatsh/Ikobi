// Met à jour le profil WhatsApp Business du numéro avec les coordonnées Ikobi.
// Usage (sur le serveur, variables WA_* déjà définies) : npm run wa:profile
// Le NOM affiché (« Ikobi ») se change dans Meta Business Manager : il passe par une validation de Meta.

const { WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_GRAPH_VERSION = 'v21.0' } = process.env;

const PROFILE = {
  messaging_product: 'whatsapp',
  about: 'Ikobi — ta tontine, en toute transparence. Écris « menu ».',
  description:
    'Ikobi organise ta tontine (likelemba) : cotisations par M-Pesa, Orange Money, Airtel Money et Afrimoney, ' +
    'rappels et suivi transparent. Écris « cotiser », « statut » ou « rejoindre CODE ».',
  email: process.env.IKOBI_SUPPORT_EMAIL || 'support@ikobi.app',
  websites: ['https://ikobi.app'],
  vertical: 'FINANCE',
  address: process.env.IKOBI_ADDRESS || 'Kinshasa, RDC',
};

if (!WA_PHONE_NUMBER_ID || !WA_ACCESS_TOKEN) {
  console.error('WA_PHONE_NUMBER_ID et WA_ACCESS_TOKEN sont requis.');
  process.exit(1);
}

const res = await fetch(`https://graph.facebook.com/${WA_GRAPH_VERSION}/${WA_PHONE_NUMBER_ID}/whatsapp_business_profile`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(PROFILE),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Échec :', body?.error?.message || res.status);
  process.exit(1);
}
console.log('Profil WhatsApp mis à jour avec les coordonnées Ikobi.');
