// Génère le site public (site/dist → ikobi.app) et le portail développeurs (api/public → api.ikobi.app).
// Usage : node site/build.mjs
import { mkdirSync, writeFileSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const SITE_OUT = join(ROOT, 'dist');
const PORTAL_OUT = join(ROOT, '..', 'api', 'public');
const SITE_URL = 'https://ikobi.app';
const API_URL = 'https://api.ikobi.app';
const CONTACT = 'contact@ikobi.app';
const UPDATED = '10 novembre 2026';

const logo = (size = 30) => `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="#2bd9a0" stroke-opacity=".55" stroke-width="2.5"/>${[0, 1, 2, 3, 4, 5].map((i) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; return `<circle cx="${(32 + 21 * Math.cos(a)).toFixed(2)}" cy="${(32 + 21 * Math.sin(a)).toFixed(2)}" r="5.2" fill="#2bd9a0"/>`; }).join('')}<circle cx="32" cy="32" r="10" fill="#f2b441"/></svg>`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout({ title, description, path, body, nav, brandSuffix = '', base = '', canonicalBase = SITE_URL, footer }) {
  const url = canonicalBase + path;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#090c15">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_CD">
<meta property="og:site_name" content="iKobi">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${canonicalBase}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${base}/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png">
<link rel="preload" href="${base}/assets/fonts/bricolage-grotesque-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${base}/assets/fonts/instrument-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${base}/assets/style.css">
<script src="${base}/assets/main.js" defer></script>
</head>
<body>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="${base}/" aria-label="iKobi, accueil">${logo()}iKobi${brandSuffix}</a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
    <nav class="nav" id="nav" aria-label="Navigation principale">${nav(path)}</nav>
  </div>
</header>
<main id="contenu">
${body}
</main>
${footer}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Site public
// ---------------------------------------------------------------------------

const siteNav = (path) => {
  const items = [
    ['/comment-ca-marche', 'Comment ça marche'],
    ['/tarifs', 'Tarifs'],
    ['/securite', 'Sécurité'],
    ['/partenaires', 'Partenaires'],
    ['/aide', 'Aide'],
  ];
  return items.map(([h, l]) => `<a href="${h}"${path === h ? ' aria-current="page"' : ''}>${l}</a>`).join('') +
    '<a class="btn btn-primary" href="/#telecharger">Obtenir l’app</a>';
};

const siteFooter = `<footer class="foot">
  <div class="wrap">
    <div class="cols">
      <div>
        <a class="brand" href="/">${logo(26)}iKobi</a>
        <p class="u-foot-intro">La tontine organisée entre personnes de confiance, en République démocratique du Congo.</p>
      </div>
      <div><h2>Produit</h2><ul><li><a href="/comment-ca-marche">Comment ça marche</a></li><li><a href="/tarifs">Tarifs et frais</a></li><li><a href="/#telecharger">Télécharger</a></li></ul></div>
      <div><h2>Confiance</h2><ul><li><a href="/securite">Sécurité</a></li><li><a href="/politiques">Confidentialité</a></li><li><a href="/conditions">Conditions d’utilisation</a></li></ul></div>
      <div><h2>Travailler avec nous</h2><ul><li><a href="/partenaires">Partenaires</a></li><li><a href="${API_URL}">API et développeurs</a></li><li><a href="/aide">Centre d’aide</a></li></ul></div>
    </div>
    <div class="legal">
      <span>© 2026 iKobi. iKobi n’est ni une banque ni un établissement de paiement.</span>
      <a href="mailto:${CONTACT}">${CONTACT}</a>
    </div>
  </div>
</footer>`;

const MEMBERS = ['Aline', 'Bénédicte', 'Christian', 'Dédé', 'Esther', 'Fiston', 'Grâce', 'Héritier'];
function circleSvg() {
  const cx = 240, cy = 240, r = 178;
  const pts = MEMBERS.map((name, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / MEMBERS.length;
    return { name, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  const members = pts.map((p, i) => {
    const cls = i === 2 ? 'member receives' : i === 3 || i === 4 || i === 5 ? 'member paid' : 'member';
    return `<g class="${cls}" data-name="${p.name}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="31"/><text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}">${p.name.slice(0, 2)}</text></g>`;
  }).join('');
  return `<figure class="circle" id="circle" data-pot="140 000 FC">
  <svg viewBox="0 0 480 480" role="img" aria-labelledby="circle-title circle-desc">
    <title id="circle-title">Une likelemba de huit membres</title>
    <desc id="circle-desc">Huit membres disposés en cercle autour de la cagnotte. À chaque tour, sept membres cotisent 20 000 FC et le huitième reçoit 140 000 FC.</desc>
    <circle class="ring" cx="240" cy="240" r="178"/>
    <circle class="flow" cx="240" cy="240" r="128"/>
    ${members}
    <circle class="pot" cx="240" cy="240" r="72"/>
    <text class="pot-label" x="240" y="236">140 000 FC</text>
    <text class="pot-sub" x="240" y="258">tour 3 sur 8</text>
  </svg>
  <figcaption aria-live="polite">Exemple : 8 membres, 20 000 FC par semaine. Chacun reçoit la cagnotte une fois.</figcaption>
</figure>`;
}

const chat = `<div class="chat" role="img" aria-label="Exemple de conversation avec l’assistant iKobi sur WhatsApp">
  <div class="chat-head"><div class="av">${logo(24)}</div><div><strong>iKobi</strong><span>Compte professionnel</span></div></div>
  <div class="bubble me">cotiser</div>
  <div class="bubble bot"><b>Cotisation Tontine Bureau</b><br>Tour 3, échéance le 14 nov.<br><br>Montant : <b>20 000 FC</b><br>Numéro : +243 ••• 4567
    <div class="choices"><span>Payer avec M-Pesa</span><span>Autre opérateur</span></div></div>
  <div class="bubble bot">Demande envoyée sur ton M-Pesa. Valide avec ton code PIN sur l’écran de ton téléphone.</div>
  <div class="bubble bot">Cotisation reçue : <b>20 000 FC</b> pour Tontine Bureau. Merci&nbsp;!</div>
  <p class="chat-note">Exemple d’échange. Le code PIN se saisit uniquement sur l’écran de l’opérateur.</p>
</div>`;

const storeIcons = {
  apple: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-4zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.9-1.4z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 2.8v18.4c0 .5.5.8.9.6l16-9.2c.4-.2.4-.8 0-1L4.9 2.2C4.5 2 4 2.3 4 2.8z" opacity=".9"/></svg>',
};

const downloadBlock = `<section id="telecharger"><div class="wrap">
  <div class="download">
    <div class="u-stack">
      <h2>L’application arrive sur iPhone et Android.</h2>
      <p class="muted">Nous finalisons les dernières vérifications avant la publication sur l’App Store et Google Play. Les liens apparaîtront ici dès que l’application sera disponible.</p>
    </div>
    <div class="stores">
      <span class="store" aria-disabled="true">${storeIcons.apple}<span><small>Bientôt sur</small><strong>App Store</strong></span></span>
      <span class="store" aria-disabled="true">${storeIcons.play}<span><small>Bientôt sur</small><strong>Google Play</strong></span></span>
    </div>
  </div>
</div></section>`;

const pages = {};

pages['/'] = {
  title: 'iKobi — votre likelemba, organisée et transparente',
  description: 'Créez une tontine (likelemba), invitez vos proches, cotisez par M-Pesa, Orange Money, Airtel Money ou Afrimoney, et suivez chaque franc. Aussi sur WhatsApp.',
  body: `<section class="hero"><div class="wrap">
  <div>
    <h1>Votre likelemba, sans cahier ni doute.</h1>
    <p class="lead">iKobi organise la tontine entre personnes de confiance : les tours, les cotisations par Mobile Money et la cagnotte de chacun. Tout le groupe voit qui a payé.</p>
    <div class="actions">
      <a class="btn btn-primary" href="#telecharger">Obtenir l’app</a>
      <a class="btn btn-ghost" href="/comment-ca-marche">Voir comment ça marche</a>
    </div>
    <p class="reassure">M-Pesa, Orange Money, Airtel Money et Afrimoney. Cotisations en francs congolais.</p>
  </div>
  ${circleSvg()}
</div></section>

<section><div class="wrap">
  <div class="section-head"><h2>Quatre gestes, du premier membre à la dernière cagnotte.</h2></div>
  <ol class="steps">
    <li><h3>Créez la tontine</h3><p>Montant, fréquence, nombre de membres et date de départ. Vous restez l’organisateur.</p></li>
    <li><h3>Invitez les membres</h3><p>Un code de six caractères à partager sur WhatsApp. Chacun indique le numéro où recevoir sa cagnotte.</p></li>
    <li><h3>Cotisez par Mobile Money</h3><p>Une demande arrive sur le téléphone, on valide avec son code PIN. Le groupe voit le paiement s’afficher.</p></li>
    <li><h3>Recevez à votre tour</h3><p>Quand tout le monde a cotisé, la cagnotte est envoyée au bénéficiaire du tour, puis le tour suivant commence.</p></li>
  </ol>
</div></section>

<section><div class="wrap split">
  <div class="copy">
    <h2>Cotiser sans quitter WhatsApp.</h2>
    <p class="lead">Écrivez « cotiser » à l’assistant iKobi. Il vous indique le montant, envoie la demande à votre opérateur et confirme dans la conversation dès que c’est reçu.</p>
    <p class="muted">Vous pouvez aussi demander « statut » pour savoir qui a payé et qui reçoit ce tour, ou rejoindre une tontine avec son code. Les rappels arrivent deux jours avant l’échéance.</p>
  </div>
  ${chat}
</div></section>

<section><div class="wrap">
  <div class="section-head">
    <h2>Chaque franc a un statut, visible par tout le groupe.</h2>
    <p class="lead">Dans une tontine papier, on ne sait jamais vraiment où en est l’argent. iKobi distingue quatre étapes et les affiche pour chaque tour.</p>
  </div>
  <div class="states">
    <div class="state"><span class="dot"></span><h3>Prévu</h3><p>Ce que le tour doit réunir : la cotisation multipliée par le nombre de membres qui paient.</p></div>
    <div class="state"><span class="dot"></span><h3>Collecté</h3><p>Ce que les opérateurs ont confirmé. Un paiement en attente ou refusé n’est jamais compté.</p></div>
    <div class="state"><span class="dot"></span><h3>Réglé</h3><p>Ce qui est arrivé sur le compte de paiement, vérifié au franc près avec le relevé.</p></div>
    <div class="state"><span class="dot"></span><h3>Versé</h3><p>Ce que le bénéficiaire a reçu sur son Mobile Money. La cagnotte ne part que lorsque tout est collecté et réglé.</p></div>
  </div>
</div></section>

<section><div class="wrap">
  <div class="section-head"><h2>La confiance, ça se vérifie.</h2></div>
  <div class="pair">
    <div>
      <h3>Ce que fait iKobi</h3>
      <ul class="ticks">
        <li>Les frais éventuels sont affichés avant chaque paiement, avec le total exact.</li>
        <li>Chaque cotisation est confirmée par l’opérateur avant d’être comptée.</li>
        <li>Chaque versement est demandé par l’organisateur puis vérifié par l’équipe iKobi.</li>
        <li>Chaque mouvement d’argent est inscrit dans un registre qu’on ne peut pas modifier après coup.</li>
      </ul>
    </div>
    <div>
      <h3>Ce qu’iKobi ne fait pas</h3>
      <ul class="ticks neutral">
        <li>Nous ne demandons jamais votre code PIN, ni par message, ni par téléphone.</li>
        <li>Nous ne promettons aucun rendement : une tontine n’est pas un placement.</li>
        <li>Nous ne garantissons pas qu’un membre paiera : la tontine repose sur la confiance entre ses membres.</li>
        <li>iKobi n’est ni une banque ni un établissement de paiement.</li>
      </ul>
    </div>
  </div>
  <p class="u-mt-xl"><a href="/securite">Tout savoir sur la sécurité</a></p>
</div></section>

${downloadBlock}`,
};

pages['/comment-ca-marche'] = {
  title: 'Comment fonctionne une tontine sur iKobi',
  description: 'Création, invitations, ordre des tours, cotisations par Mobile Money, versement de la cagnotte : le fonctionnement d’une likelemba sur iKobi, étape par étape.',
  body: `<section class="page-head"><div class="wrap">
  <h1>Comment ça marche</h1>
  <p class="lead">Une tontine tournante, ou likelemba : chaque membre cotise le même montant à chaque tour, et un membre différent reçoit la cagnotte à chaque tour.</p>
</div></section>

<section><div class="wrap">
  <ol class="steps">
    <li><h3>Créer</h3><p>L’organisateur fixe le montant par membre, la fréquence (chaque semaine, toutes les deux semaines ou chaque mois), le nombre de membres et la première échéance.</p></li>
    <li><h3>Inviter</h3><p>Il partage le code d’invitation. Les membres rejoignent dans l’app ou sur WhatsApp en écrivant « rejoindre » suivi du code.</p></li>
    <li><h3>Démarrer</h3><p>Quand le groupe est au complet, l’organisateur démarre : ordre d’arrivée ou tirage au sort. Le calendrier des tours s’affiche pour tous.</p></li>
    <li><h3>Tourner</h3><p>À chaque tour, les membres cotisent, le bénéficiaire reçoit la cagnotte, puis le tour suivant s’ouvre, jusqu’au dernier membre.</p></li>
  </ol>
</div></section>

<section><div class="wrap split">
  <div class="copy">
    <h2>Un exemple concret</h2>
    <p class="muted">Huit collègues créent « Tontine Bureau » : 20 000 FC chaque semaine.</p>
    <ul class="ticks">
      <li>À chaque tour, sept membres cotisent 20 000 FC. Le bénéficiaire du tour ne cotise pas.</li>
      <li>Le bénéficiaire reçoit 7 × 20 000 FC, soit 140 000 FC.</li>
      <li>Après huit semaines, chacun a reçu la cagnotte une fois et versé 140 000 FC au total.</li>
    </ul>
    <p class="note">Recevoir tôt revient à être avancé par le groupe ; recevoir tard revient à épargner. Personne ne gagne ni ne perd d’argent dans une tontine qui va jusqu’au bout, hors frais d’opérateur.</p>
  </div>
  ${circleSvg()}
</div></section>

<section><div class="wrap">
  <div class="section-head"><h2>Le versement de la cagnotte</h2>
  <p class="lead">L’argent ne part que lorsque le tour est entièrement payé. Voici ce qui se passe entre la dernière cotisation et le Mobile Money du bénéficiaire.</p></div>
  <ol class="steps">
    <li><h3>Tour complet</h3><p>Toutes les cotisations du tour sont confirmées par les opérateurs.</p></li>
    <li><h3>Demande</h3><p>L’organisateur demande le versement depuis l’app.</p></li>
    <li><h3>Vérification</h3><p>L’équipe iKobi vérifie que les fonds sont bien arrivés sur le compte de paiement, au franc près.</p></li>
    <li><h3>Envoi</h3><p>La cagnotte est envoyée sur le numéro Mobile Money choisi par le bénéficiaire, qui reçoit une confirmation.</p></li>
  </ol>
</div></section>

<section><div class="wrap">
  <div class="section-head"><h2>Si un membre ne paie pas</h2></div>
  <div class="prose">
    <p>Le tour reste ouvert et la cagnotte n’est pas versée tant que toutes les cotisations ne sont pas collectées. Le membre reçoit des rappels deux jours avant l’échéance, le jour même, puis deux jours après. Tout le groupe voit qui a payé et qui est en attente.</p>
    <p>iKobi ne paie pas à la place d’un membre défaillant. C’est au groupe, et à son organisateur, de choisir des personnes de confiance et de régler les retards entre eux.</p>
  </div>
</div></section>
${downloadBlock}`,
};

pages['/tarifs'] = {
  title: 'Tarifs et frais — iKobi',
  description: 'Les frais d’iKobi sont affichés avant chaque paiement, avec le total exact. Créer une tontine, inviter des membres et utiliser WhatsApp sont gratuits.',
  body: `<section class="page-head"><div class="wrap">
  <h1>Tarifs et frais</h1>
  <p class="lead">Aucun frais caché : le montant exact à payer s’affiche avant que vous confirmiez, dans l’app comme sur WhatsApp.</p>
</div></section>
<section><div class="wrap u-stack-xl">
  <div class="table-wrap"><table class="stack">
    <thead><tr><th scope="col">Service</th><th scope="col">Prix</th><th scope="col">Précisions</th></tr></thead>
    <tbody>
      <tr><td data-label="Service">Télécharger l’app, créer un compte</td><td data-label="Prix" class="num">Gratuit</td><td data-label="Précisions" class="muted">Connexion par code WhatsApp, sans mot de passe.</td></tr>
      <tr><td data-label="Service">Créer une tontine, inviter des membres</td><td data-label="Prix" class="num">Gratuit</td><td data-label="Précisions" class="muted">Sans limite de nombre de tontines.</td></tr>
      <tr><td data-label="Service">Assistant WhatsApp et rappels</td><td data-label="Prix" class="num">Gratuit</td><td data-label="Précisions" class="muted">Les frais de connexion internet restent ceux de votre opérateur.</td></tr>
      <tr><td data-label="Service">Payer une cotisation</td><td data-label="Prix" class="num">Affiché avant paiement</td><td data-label="Précisions" class="muted">Les frais de traitement éventuels s’ajoutent à la cotisation et sont montrés avec le total.</td></tr>
      <tr><td data-label="Service">Recevoir la cagnotte</td><td data-label="Prix" class="num">Affiché avant versement</td><td data-label="Précisions" class="muted">Les frais de versement éventuels sont déduits et le montant net est indiqué.</td></tr>
    </tbody>
  </table></div>
  <div class="split u-start">
    <div class="copy">
      <h2>À quoi ressemble un récapitulatif</h2>
      <p class="muted">Avant chaque cotisation, l’app affiche ce récapitulatif. Les montants ci-contre sont un exemple de présentation, pas un tarif.</p>
      <p class="note">Notre grille de frais définitive est en cours de validation avec notre partenaire de paiement. Elle sera publiée sur cette page avant l’ouverture des paiements.</p>
    </div>
    <div class="receipt" aria-label="Exemple de récapitulatif de paiement">
      <div><span class="muted">Cotisation</span><span>20 000 FC</span></div>
      <div><span class="muted">Frais de traitement</span><span>exemple</span></div>
      <div class="total"><span>Total à payer</span><span>affiché ici</span></div>
    </div>
  </div>
</div></section>
<section><div class="wrap">
  <div class="section-head"><h2>Pour les institutions</h2>
  <p class="lead">Banques, institutions de microfinance, coopératives : abonnement, accès API ou financement des frais de vos membres. Parlons de votre projet.</p></div>
  <a class="btn btn-ghost" href="/partenaires">Découvrir l’offre partenaires</a>
</div></section>`,
};

pages['/securite'] = {
  title: 'Sécurité et confiance — iKobi',
  description: 'Comment iKobi protège votre argent et vos données : confirmation par l’opérateur, versements vérifiés, registre infalsifiable, aucun code PIN demandé.',
  body: `<section class="page-head"><div class="wrap">
  <h1>Sécurité et confiance</h1>
  <p class="lead">Une tontine repose sur la confiance entre ses membres. Notre rôle est de rendre chaque mouvement d’argent vérifiable, et de dire clairement ce que nous ne pouvons pas garantir.</p>
</div></section>
<section><div class="wrap prose">
  <h2>Votre argent</h2>
  <ul>
    <li><strong>Confirmé par l’opérateur.</strong> Une cotisation n’est comptée que lorsque l’opérateur Mobile Money confirme le paiement. Nous revérifions chaque confirmation avant de l’inscrire.</li>
    <li><strong>Jamais versé à moitié.</strong> La cagnotte ne part que lorsque toutes les cotisations du tour sont collectées et arrivées sur le compte de paiement, vérifiées au franc près.</li>
    <li><strong>Vérifié par deux personnes.</strong> L’organisateur demande le versement, l’équipe iKobi le vérifie. Personne ne peut valider sa propre demande.</li>
    <li><strong>Inscrit pour de bon.</strong> Chaque mouvement est enregistré dans un registre comptable qu’on ne peut que compléter, jamais réécrire.</li>
  </ul>
  <h2>Votre compte</h2>
  <ul>
    <li>Connexion par un code à usage unique envoyé sur WhatsApp, valable dix minutes.</li>
    <li>Votre session est conservée dans l’espace protégé de votre téléphone.</li>
    <li>Nous ne vous demanderons jamais votre code PIN Mobile Money. Il se saisit uniquement dans la fenêtre officielle de votre opérateur.</li>
  </ul>
  <h2>Vos données</h2>
  <ul>
    <li>Les membres d’une tontine voient votre nom et les quatre derniers chiffres de votre numéro, rien de plus.</li>
    <li>Nous ne vendons pas vos données. Nos partenaires institutionnels n’accèdent qu’à des statistiques agrégées, publiées à partir de cinq communautés.</li>
    <li>Vous pouvez supprimer votre compte depuis l’app, une fois vos tontines en cours terminées.</li>
  </ul>
  <h2>Ce que nous ne garantissons pas</h2>
  <p>Une tontine comporte un risque : un membre peut payer en retard ou ne pas payer. iKobi ne paie pas à la place d’un membre et ne promet aucun rendement. iKobi n’est ni une banque ni un établissement de paiement ; les paiements sont traités par notre partenaire de paiement AWA Network et par les opérateurs Mobile Money.</p>
  <h2>Signaler un problème</h2>
  <p>Paiement suspect, message se faisant passer pour iKobi, faille de sécurité : écrivez-nous à <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
</div></section>`,
};

pages['/partenaires'] = {
  title: 'Partenaires — banques, microfinance, coopératives | iKobi',
  description: 'iKobi aide les institutions financières et les organisations communautaires à accompagner l’épargne des groupes. Accès API, statistiques agrégées, pilotes.',
  body: `<section class="page-head"><div class="wrap">
  <h1>Travailler avec iKobi</h1>
  <p class="lead">Des milliers de groupes épargnent déjà ensemble, souvent sur papier. iKobi structure cette épargne et, avec l’accord des membres, la rapproche des services financiers formels.</p>
</div></section>
<section><div class="wrap">
  <div class="audiences">
    <div class="audience feature">
      <h2>Banques et institutions de microfinance</h2>
      <p class="muted">Comprendre l’épargne communautaire de votre zone, accompagner des groupes de commerçantes et d’entrepreneures, préparer des offres adaptées.</p>
      <ul class="ticks">
        <li>Statistiques agrégées par API : communautés actives, tours achevés, ponctualité des cotisations.</li>
        <li>Pilotes encadrés avec des groupes volontaires, avec un suivi convenu ensemble.</li>
        <li>Vous gardez seuls la décision et la responsabilité de tout financement : nos indicateurs ne sont pas une note de crédit.</li>
      </ul>
      <div><a class="btn btn-primary" href="${API_URL}/cle-api">Demander un accès API</a></div>
    </div>
    <div class="audience">
      <h3>Coopératives, associations, églises</h3>
      <p class="muted">Organiser les cotisations de vos membres, suivre chaque groupe et communiquer par WhatsApp.</p>
    </div>
    <div class="audience">
      <h3>Développeurs et intégrateurs</h3>
      <p class="muted">Documentation, clé API et environnement de test sur le portail développeurs.</p>
      <a href="${API_URL}">Ouvrir le portail développeurs</a>
    </div>
  </div>
</div></section>
<section><div class="wrap prose">
  <h2>Ambassadeurs communautaires</h2>
  <p>Nous préparons un programme pour les personnes qui accompagnent les groupes sur le terrain : formation, aide à l’inscription, animation des tontines. Il ne sera jamais rémunéré au simple recrutement, et aucun achat ne sera demandé pour y participer.</p>
  <p>Intéressé ? Écrivez-nous à <a href="mailto:${CONTACT}?subject=${encodeURIComponent('Programme ambassadeurs')}">${CONTACT}</a>.</p>
</div></section>`,
};

const FAQ = [
  ['Qu’est-ce qu’une likelemba ?', ['Une tontine tournante : un groupe de personnes de confiance cotise le même montant à intervalles réguliers, et à chaque tour un membre différent reçoit toute la cagnotte. Quand chacun l’a reçue une fois, la tontine est terminée.']],
  ['Combien coûte iKobi ?', ['Créer une tontine, inviter des membres et utiliser l’assistant WhatsApp sont gratuits. Les frais de paiement éventuels sont affichés avant chaque paiement, avec le total exact. <a href="/tarifs">Voir les tarifs</a>.']],
  ['Quels moyens de paiement sont acceptés ?', ['M-Pesa (Vodacom), Orange Money, Airtel Money et Afrimoney (Africell), en francs congolais. Le dollar n’est pas encore disponible.']],
  ['Comment se connecter ?', ['Avec votre numéro de téléphone : nous vous envoyons un code à six chiffres sur WhatsApp. Il n’y a pas de mot de passe à retenir.']],
  ['iKobi peut-il me demander mon code PIN ?', ['Jamais. Le code PIN se saisit uniquement dans la fenêtre de votre opérateur, sur l’écran de votre téléphone. Si quelqu’un vous le demande au nom d’iKobi, c’est une arnaque : signalez-la à <a href="mailto:' + CONTACT + '">' + CONTACT + '</a>.']],
  ['Le bénéficiaire du tour doit-il cotiser ?', ['Non. À chaque tour, tous les membres sauf le bénéficiaire cotisent. Il reçoit la cotisation multipliée par le nombre de membres moins un.']],
  ['Quand la cagnotte est-elle versée ?', ['Quand toutes les cotisations du tour sont confirmées et arrivées sur le compte de paiement. L’organisateur demande alors le versement, l’équipe iKobi le vérifie, puis l’argent est envoyé sur le Mobile Money du bénéficiaire.']],
  ['Que se passe-t-il si un membre ne paie pas ?', ['Le tour reste ouvert et la cagnotte n’est pas versée. Le membre reçoit des rappels, et le groupe voit qui est en attente. iKobi ne paie pas à la place d’un membre : choisissez des personnes de confiance.']],
  ['Mon paiement est « en attente » : que faire ?', ['Vérifiez votre téléphone et validez la demande avec votre code PIN. Si vous l’avez déjà fait, patientez quelques minutes : nous interrogeons l’opérateur automatiquement. Un paiement en attente n’est jamais compté deux fois.']],
  ['Puis-je cotiser sur WhatsApp ?', ['Oui. Écrivez « cotiser » à l’assistant iKobi : il vous montre le montant, envoie la demande à votre opérateur et confirme dans la conversation. Écrivez « statut » pour voir où en sont vos tontines.']],
  ['Comment supprimer mon compte ?', ['Dans l’app : Profil, puis Supprimer mon compte. La suppression est possible quand vous n’avez plus de tontine en cours.']],
  ['iKobi est-il une banque ?', ['Non. iKobi est un outil d’organisation des tontines. Les paiements sont traités par notre partenaire de paiement AWA Network et par les opérateurs Mobile Money.']],
];

pages['/aide'] = {
  title: 'Centre d’aide — iKobi',
  description: 'Réponses aux questions fréquentes : fonctionnement de la likelemba, paiements Mobile Money, WhatsApp, versements, sécurité, compte.',
  body: `<section class="page-head"><div class="wrap">
  <h1>Centre d’aide</h1>
  <p class="lead">Les réponses aux questions les plus fréquentes. Vous ne trouvez pas ? Écrivez-nous à <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
</div></section>
<section><div class="wrap">
  <div class="faq">${FAQ.map(([q, a]) => `<details><summary>${q}</summary><div class="answer">${a.map((p) => `<p>${p}</p>`).join('')}</div></details>`).join('')}</div>
</div></section>`,
  extraHead: '',
  jsonld: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.join(' ').replace(/<[^>]+>/g, '') } })) },
};

pages['/politiques'] = {
  title: 'Politique de confidentialité — iKobi',
  description: 'Quelles données iKobi collecte, pourquoi, qui y a accès, combien de temps elles sont conservées et comment exercer vos droits.',
  body: `<section class="page-head"><div class="wrap"><h1>Politique de confidentialité</h1><p class="updated u-mt">Dernière mise à jour : ${UPDATED}. Document en cours de relecture juridique.</p></div></section>
<section><div class="wrap prose">
  <h2>Données collectées</h2>
  <ul>
    <li>Votre numéro de téléphone et le nom que vous indiquez.</li>
    <li>Les tontines dont vous êtes membre, vos cotisations, les cagnottes reçues et les numéros Mobile Money que vous choisissez.</li>
    <li>Vos messages à l’assistant WhatsApp iKobi, pour exécuter vos demandes.</li>
    <li>Un identifiant technique de notification si vous acceptez les notifications.</li>
  </ul>
  <p>Nous ne collectons ni votre code PIN, ni votre position, ni vos contacts.</p>
  <h2>Pourquoi</h2>
  <ul>
    <li>Faire fonctionner vos tontines : tours, cotisations, versements, rappels.</li>
    <li>Respecter nos obligations : traçabilité des opérations, prévention de la fraude.</li>
    <li>Produire des statistiques agrégées et anonymes, publiées à partir de cinq communautés.</li>
  </ul>
  <h2>Qui y a accès</h2>
  <ul>
    <li>Les membres de vos tontines : votre nom, les quatre derniers chiffres de votre numéro et votre statut de paiement du tour.</li>
    <li>Notre partenaire de paiement AWA Network et votre opérateur Mobile Money, pour exécuter les paiements.</li>
    <li>Meta (WhatsApp Business), si vous utilisez l’assistant WhatsApp.</li>
    <li>Notre hébergeur, Hostinger.</li>
  </ul>
  <p>Nous ne vendons jamais vos données.</p>
  <h2>Conservation</h2>
  <p>Vos données de compte sont conservées tant que votre compte est actif. Les données de paiement peuvent être conservées plus longtemps lorsque la loi l’exige.</p>
  <h2>Vos droits</h2>
  <p>Vous pouvez consulter, corriger ou supprimer vos données. La suppression du compte se fait dans l’app (Profil, puis Supprimer mon compte) une fois vos tontines terminées. Pour toute demande : <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
</div></section>`,
};

pages['/conditions'] = {
  title: 'Conditions d’utilisation — iKobi',
  description: 'Les règles d’utilisation d’iKobi : rôle d’iKobi, engagements des membres et des organisateurs, paiements, frais, responsabilités.',
  body: `<section class="page-head"><div class="wrap"><h1>Conditions d’utilisation</h1><p class="updated u-mt">Dernière mise à jour : ${UPDATED}. Document en cours de relecture juridique.</p></div></section>
<section><div class="wrap prose">
  <h2>Le service</h2>
  <p>iKobi est un outil qui aide des groupes de personnes qui se connaissent à organiser une tontine tournante : membres, calendrier des tours, cotisations, versements et rappels. iKobi n’est ni une banque, ni un établissement de paiement, ni un conseiller en investissement.</p>
  <h2>Vos engagements</h2>
  <ul>
    <li>Fournir des informations exactes et utiliser un numéro de téléphone qui vous appartient.</li>
    <li>Payer vos cotisations à l’échéance convenue avec votre groupe.</li>
    <li>Ne pas utiliser iKobi pour une activité illégale, pour blanchir de l’argent ou pour tromper d’autres membres.</li>
  </ul>
  <h2>L’organisateur</h2>
  <p>L’organisateur crée la tontine, invite les membres, démarre les tours et demande le versement de chaque cagnotte. Il ne peut pas valider seul un versement : l’équipe iKobi le vérifie.</p>
  <h2>Paiements et frais</h2>
  <p>Les paiements sont exécutés par notre partenaire de paiement et par les opérateurs Mobile Money, selon leurs propres conditions. Les frais applicables sont affichés avant chaque paiement. Une cagnotte n’est versée que lorsque toutes les cotisations du tour ont été collectées et réglées.</p>
  <h2>Risques et responsabilité</h2>
  <p>Une tontine repose sur l’engagement de chaque membre. Un membre peut payer en retard ou ne pas payer ; iKobi ne se substitue pas à lui et ne garantit pas le versement d’une cagnotte dont les fonds n’ont pas été collectés. Aucun rendement n’est promis.</p>
  <h2>Suspension</h2>
  <p>Nous pouvons suspendre un compte en cas de fraude, d’usurpation d’identité ou de non-respect de ces conditions, après vérification.</p>
  <h2>Contact</h2>
  <p><a href="mailto:${CONTACT}">${CONTACT}</a></p>
</div></section>`,
};

pages['/404'] = {
  title: 'Page introuvable — iKobi',
  description: 'Cette page n’existe pas ou a été déplacée.',
  body: `<section class="page-head"><div class="wrap u-stack-l"><h1>Cette page n’existe pas.</h1><p class="lead">L’ancienne application web a été remplacée par l’application mobile iKobi. Votre tontine se gère désormais depuis l’app ou sur WhatsApp.</p><div><a class="btn btn-primary" href="/">Revenir à l’accueil</a></div></div></section>`,
};

// ---------------------------------------------------------------------------
// Portail développeurs (api.ikobi.app)
// ---------------------------------------------------------------------------

const portalNav = (path) => {
  const items = [['/docs', 'Documentation'], ['/docs#api-partenaire', 'API partenaire'], ['/statut', 'Statut']];
  return items.map(([h, l]) => `<a href="${h}"${path === h ? ' aria-current="page"' : ''}>${l}</a>`).join('') +
    `<a href="${SITE_URL}">ikobi.app</a><a class="btn btn-primary" href="/cle-api">Demander une clé API</a>`;
};

const portalFooter = `<footer class="foot"><div class="wrap">
  <div class="legal u-flush">
    <span>© 2026 iKobi — portail développeurs. Clés et données soumises aux <a href="${SITE_URL}/conditions">conditions d’utilisation</a> et à la <a href="${SITE_URL}/politiques">politique de confidentialité</a>.</span>
    <a href="mailto:${CONTACT}">${CONTACT}</a>
  </div>
</div></footer>`;

const portalPages = {};

portalPages['/'] = {
  title: 'iKobi API — portail développeurs',
  description: 'Documentation de l’API iKobi, API partenaire de statistiques agrégées et demande de clé API pour les banques, IMF, coopératives et développeurs.',
  body: `<section class="hero"><div class="wrap u-hero-api">
  <div>
    <h1 class="u-w13">Construire avec iKobi.</h1>
    <p class="lead">L’API qui fait tourner l’app iKobi et son assistant WhatsApp, et une API partenaire pour suivre l’épargne communautaire sans jamais exposer de donnée personnelle.</p>
    <div class="actions"><a class="btn btn-primary" href="/cle-api">Demander une clé API</a><a class="btn btn-ghost" href="/docs">Lire la documentation</a></div>
    <p class="reassure"><span class="status-pill" id="api-status"><i></i><span>Vérification de l’état de l’API…</span></span></p>
  </div>
  <pre aria-label="Exemple d’appel à l’API partenaire"><code>curl ${API_URL}/partner/v1/insights \\
  -H "Authorization: Bearer ikb_live_…"

{
  "available": true,
  "communities": { "total": 25, "active": 18, … },
  "members": 500,
  "completedCycles": 112,
  "contributions": {
    "last30Days": [{ "currency": "CDF",
                     "count": 1840, … }],
    "onTimeRate": 91.4
  }
}</code></pre>
</div></section>
<section><div class="wrap">
  <div class="audiences">
    <div class="audience feature">
      <h2>API partenaire</h2>
      <p class="muted">Pour les banques, institutions de microfinance et organisations communautaires. Lecture seule, statistiques agrégées, publiées à partir de cinq communautés.</p>
      <div class="endpoint"><span class="verb">GET</span><code>/partner/v1/insights</code></div>
      <div class="endpoint"><span class="verb">GET</span><code>/partner/v1/ping</code></div>
      <div><a href="/docs#api-partenaire">Référence de l’API partenaire</a></div>
    </div>
    <div class="audience">
      <h3>API de l’application</h3>
      <p class="muted">Authentification par code WhatsApp, tontines, cotisations Mobile Money, versements. Réservée aux applications iKobi.</p>
      <a href="/docs#api-application">Voir les routes</a>
    </div>
    <div class="audience">
      <h3>Spécification OpenAPI</h3>
      <p class="muted">Importez le fichier dans Postman, Insomnia ou votre générateur de client.</p>
      <a href="/openapi.json">Télécharger openapi.json</a>
    </div>
  </div>
</div></section>
<section><div class="wrap">
  <div class="section-head"><h2>Obtenir une clé, en trois étapes</h2></div>
  <ol class="steps steps-3">
    <li><h3>Décrivez votre projet</h3><p>Organisation, contact, usage prévu. Deux minutes suffisent.</p></li>
    <li><h3>Nous examinons</h3><p>L’équipe conformité vérifie l’organisation et l’usage. Réponse par e-mail.</p></li>
    <li><h3>Recevez votre clé</h3><p>Transmise par un canal sûr convenu avec vous, affichée une seule fois. Révocable à tout moment.</p></li>
  </ol>
  <p class="u-mt-l"><a class="btn btn-primary" href="/cle-api">Commencer la demande</a></p>
</div></section>`,
};

const req = (verb, path, desc) => `<div class="endpoint"><span class="verb${verb === 'POST' || verb === 'PATCH' || verb === 'DELETE' ? ' post' : ''}">${verb}</span><code>${path}</code></div><p class="muted">${desc}</p>`;

portalPages['/docs'] = {
  title: 'Documentation — iKobi API',
  description: 'Authentification, API partenaire, API de l’application, erreurs, limites de débit et bonnes pratiques de l’API iKobi.',
  body: `<div class="wrap docs">
  <nav aria-label="Sommaire de la documentation">
    <strong>Démarrer</strong>
    <a href="#introduction">Introduction</a>
    <a href="#authentification">Authentification</a>
    <a href="#erreurs">Erreurs</a>
    <a href="#limites">Limites de débit</a>
    <strong>Référence</strong>
    <a href="#api-partenaire">API partenaire</a>
    <a href="#api-application">API de l’application</a>
    <a href="#webhooks">Webhooks</a>
    <strong>Politique</strong>
    <a href="#donnees">Données et confidentialité</a>
    <a href="#versions">Versions</a>
  </nav>
  <article>
    <h1 class="u-h1-s">Documentation</h1>
    <h2 id="introduction">Introduction</h2>
    <p>L’API iKobi est une API REST qui échange du JSON en UTF-8. Toutes les requêtes passent par HTTPS sur <code>${API_URL}</code>. Les montants sont des nombres décimaux dans la devise indiquée (<code>CDF</code> aujourd’hui) ; les dates d’échéance sont au format <code>AAAA-MM-JJ</code>, les horodatages en ISO 8601 UTC.</p>
    <p>Deux familles de routes :</p>
    <ul>
      <li><strong>API partenaire</strong> (<code>/partner/v1</code>) : pour les institutions, avec une clé API. Lecture seule, statistiques agrégées.</li>
      <li><strong>API de l’application</strong> (<code>/v1</code>) : utilisée par l’app iKobi, avec le jeton de session d’un membre.</li>
    </ul>

    <h2 id="authentification">Authentification</h2>
    <h3>Clé API partenaire</h3>
    <p>Envoyez votre clé dans l’en-tête <code>Authorization</code>. L’en-tête <code>X-API-Key</code> est aussi accepté.</p>
    <pre><code>Authorization: Bearer ikb_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX</code></pre>
    <p>La clé est affichée une seule fois, à sa création. Gardez-la côté serveur : jamais dans une application mobile, une page web ou un dépôt de code. Si elle est exposée, demandez sa révocation à <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
    <h3>Session membre (application)</h3>
    <p>Le membre reçoit un code à six chiffres sur WhatsApp, puis l’échange contre un jeton de session.</p>
    <pre><code>POST /v1/auth/otp/request   { "phone": "0812345678" }
POST /v1/auth/otp/verify    { "phone": "0812345678", "code": "123456", "name": "Aline" }
→ { "token": "eyJ…", "user": { "id": 1, "name": "Aline", … } }

Authorization: Bearer eyJ…</code></pre>

    <h2 id="erreurs">Erreurs</h2>
    <p>Les erreurs renvoient un code HTTP explicite et un corps de forme constante :</p>
    <pre><code>{
  "error": {
    "code": "validation",
    "message": "Données invalides",
    "details": [{ "path": "email", "message": "E-mail invalide" }]
  }
}</code></pre>
    <div class="table-wrap"><table>
      <thead><tr><th>HTTP</th><th>Signification</th></tr></thead>
      <tbody>
        <tr><td class="num">400</td><td>Requête invalide (<code>validation</code>, <code>bad_json</code>, <code>payment_refused</code>…)</td></tr>
        <tr><td class="num">401</td><td>Clé ou jeton absent, invalide ou révoqué</td></tr>
        <tr><td class="num">403</td><td>Authentifié, mais sans le droit nécessaire</td></tr>
        <tr><td class="num">404</td><td>Ressource introuvable</td></tr>
        <tr><td class="num">409</td><td>Conflit d’état (déjà payé, tour non prêt, demande déjà traitée…)</td></tr>
        <tr><td class="num">429</td><td>Trop de requêtes</td></tr>
        <tr><td class="num">503</td><td>Service en configuration ou en maintenance</td></tr>
      </tbody>
    </table></div>

    <h2 id="limites">Limites de débit</h2>
    <p>API partenaire : 60 requêtes par minute et par adresse IP. Les en-têtes <code>RateLimit-*</code> indiquent le quota restant. Au-delà, l’API répond <code>429</code> : attendez la fin de la fenêtre avant de réessayer.</p>

    <h2 id="api-partenaire">API partenaire</h2>
    ${req('GET', '/partner/v1/ping', 'Vérifie votre clé. Renvoie le nom de l’organisation et les droits de la clé.')}
    <pre><code>{ "ok": true, "partner": "Coopérative de Matete", "scopes": ["insights:read"] }</code></pre>
    ${req('GET', '/partner/v1/insights', 'Statistiques agrégées de la plateforme. Droit requis : insights:read.')}
    <pre><code>{
  "generatedAt": "2026-11-10T19:00:00.000Z",
  "available": true,
  "communities": { "total": 25, "forming": 3, "active": 18, "completed": 4 },
  "members": 500,
  "completedCycles": 112,
  "contributions": {
    "allTime":    [{ "currency": "CDF", "count": 5210, "volume": 104200000 }],
    "last30Days": [{ "currency": "CDF", "count": 1840, "volume": 36800000 }],
    "onTimeRate": 91.4
  },
  "note": "Chiffres agrégés et indicatifs…"
}</code></pre>
    <p>Tant que la plateforme compte moins de cinq communautés, la réponse vaut <code>{ "available": false, "reason": "…" }</code>. Ces indicateurs ne constituent ni une évaluation de crédit ni une décision de financement.</p>
    <p class="note">D’autres ressources (suivi d’un pilote, export de rapports) seront ajoutées avec nos premiers partenaires. Dites-nous ce dont vous avez besoin dans votre demande de clé.</p>

    <h2 id="api-application">API de l’application</h2>
    <p>Routes utilisées par l’app iKobi. Elles exigent un jeton de session membre et ne sont pas ouvertes aux intégrations tierces.</p>
    ${req('GET', '/v1/config', 'Opérateurs et devises disponibles.')}
    ${req('GET', '/v1/me', 'Profil du membre connecté.')}
    ${req('GET', '/v1/groups', 'Tontines du membre, avec l’état du tour en cours.')}
    ${req('POST', '/v1/groups', 'Crée une tontine : nom, montant, devise, fréquence, nombre de membres, première échéance, numéro de versement.')}
    ${req('POST', '/v1/groups/join', 'Rejoint une tontine avec son code d’invitation.')}
    ${req('GET', '/v1/groups/{id}', 'Détail : membres, calendrier, montants prévu, collecté, réglé et versé.')}
    ${req('POST', '/v1/groups/{id}/start', 'Démarre la tontine (organisateur).')}
    ${req('GET', '/v1/groups/{id}/contributions/quote?method=mpesa', 'Devis : cotisation, frais, total à payer.')}
    ${req('POST', '/v1/groups/{id}/contributions', 'Lance une cotisation Mobile Money. Statut initial « pending ».')}
    ${req('GET', '/v1/contributions/{id}', 'Statut d’une cotisation.')}
    ${req('POST', '/v1/groups/{id}/cycles/{n}/payout-request', 'Demande le versement de la cagnotte (organisateur). Validé ensuite par l’équipe iKobi.')}
    ${req('GET', '/v1/groups/{id}/history', 'Historique des cotisations et des versements.')}

    <h2 id="webhooks">Webhooks</h2>
    <p>iKobi reçoit les notifications de son partenaire de paiement et de WhatsApp. Chaque notification est authentifiée par signature, dédoublonnée et, pour un paiement réussi, reconfirmée auprès du fournisseur avant d’être prise en compte. L’envoi de webhooks vers les partenaires n’est pas encore proposé.</p>

    <h2 id="donnees">Données et confidentialité</h2>
    <ul>
      <li>L’API partenaire ne renvoie aucune donnée personnelle : ni nom, ni numéro, ni détail d’une tontine.</li>
      <li>Chaque clé est liée à une organisation identifiée et à un usage déclaré ; son utilisation est journalisée.</li>
      <li>Toute réidentification de membres, revente de données ou usage différent de celui déclaré entraîne la révocation de la clé.</li>
    </ul>

    <h2 id="versions">Versions</h2>
    <p>La version figure dans le chemin (<code>/v1</code>, <code>/partner/v1</code>). Les ajouts compatibles (nouveaux champs, nouvelles routes) peuvent arriver à tout moment : ignorez les champs que vous ne connaissez pas. Une rupture de compatibilité donnera lieu à une nouvelle version annoncée à l’avance aux détenteurs de clé.</p>
  </article>
</div>`,
};

portalPages['/cle-api'] = {
  title: 'Demander une clé API — iKobi',
  description: 'Demandez une clé pour l’API partenaire iKobi : statistiques agrégées sur l’épargne communautaire.',
  body: `<section class="page-head"><div class="wrap u-stack">
  <h1>Demander une clé API</h1>
  <p class="lead">Pour les banques, institutions de microfinance, coopératives, ONG et développeurs. Nous répondons par e-mail après examen de la demande.</p>
</div></section>
<section class="u-flush"><div class="wrap">
  <form class="form" id="key-form" novalidate>
    <div class="row-2">
      <div class="field"><label for="orgName">Organisation</label><input id="orgName" name="orgName" required maxlength="120" autocomplete="organization"></div>
      <div class="field"><label for="orgType">Type d’organisation</label>
        <select id="orgType" name="orgType" required>
          <option value="banque">Banque</option><option value="imf">Institution de microfinance</option><option value="cooperative">Coopérative</option>
          <option value="association">Association ou église</option><option value="ong">ONG</option><option value="entreprise">Entreprise</option>
          <option value="developpeur">Développeur indépendant</option><option value="autre">Autre</option>
        </select></div>
    </div>
    <div class="row-2">
      <div class="field"><label for="country">Pays</label>
        <select id="country" name="country" required><option value="CD">RD Congo</option><option value="GA">Gabon</option><option value="CG">Congo-Brazzaville</option><option value="CM">Cameroun</option><option value="FR">France</option><option value="BE">Belgique</option><option value="ZZ">Autre</option></select></div>
      <div class="field"><label for="website">Site web <span class="muted">(facultatif)</span></label><input id="website" name="website" type="url" inputmode="url" placeholder="https://" autocomplete="url"></div>
    </div>
    <div class="row-2">
      <div class="field"><label for="contactName">Nom du contact</label><input id="contactName" name="contactName" required maxlength="80" autocomplete="name"></div>
      <div class="field"><label for="email">E-mail professionnel</label><input id="email" name="email" type="email" required maxlength="160" autocomplete="email"></div>
    </div>
    <div class="row-2">
      <div class="field"><label for="phone">Téléphone <span class="muted">(facultatif)</span></label><input id="phone" name="phone" type="tel" maxlength="20" autocomplete="tel"></div>
      <div class="field"><label for="volume">Volume d’appels prévu par mois</label>
        <select id="volume" name="volume"><option value="">Je ne sais pas encore</option><option value="&lt;100">Moins de 100</option><option value="100-1000">100 à 1 000</option><option value="1000-10000">1 000 à 10 000</option><option value="&gt;10000">Plus de 10 000</option></select></div>
    </div>
    <div class="field"><label for="useCase">Votre projet</label>
      <p class="hint" id="useCase-hint">Ce que vous voulez faire avec l’API, pour quels publics, dans quelle zone.</p>
      <textarea id="useCase" name="useCase" required minlength="30" maxlength="2000" aria-describedby="useCase-hint"></textarea></div>
    <div class="hp" aria-hidden="true"><label for="company">Ne pas remplir</label><input id="company" name="company" tabindex="-1" autocomplete="off"></div>
    <div class="check"><input id="consent" name="consent" type="checkbox" required><label for="consent">J’accepte qu’iKobi traite ces informations pour examiner ma demande, selon la <a href="${SITE_URL}/politiques">politique de confidentialité</a>.</label></div>
    <div><button class="btn btn-primary" type="submit">Envoyer la demande</button></div>
  </form>
  <div class="u-result" id="key-result" role="status" tabindex="-1" hidden></div>
</div></section>`,
};

portalPages['/statut'] = {
  title: 'Statut — iKobi API',
  description: 'État de l’API iKobi.',
  body: `<section class="page-head"><div class="wrap u-stack-l">
  <h1>Statut de l’API</h1>
  <p><span class="status-pill" id="api-status"><i></i><span>Vérification…</span></span></p>
  <p class="muted">Cet indicateur interroge <code>/v1/health</code> en direct. Pendant la phase de configuration, le portail et les demandes de clé fonctionnent ; les paiements ouvriront après les derniers contrôles.</p>
</div></section>`,
};

// ---------------------------------------------------------------------------
// OpenAPI (API partenaire + routes publiques)
// ---------------------------------------------------------------------------
const openapi = {
  openapi: '3.1.0',
  info: { title: 'iKobi API', version: '1.0.0-beta', description: 'API partenaire (statistiques agrégées) et routes publiques du portail iKobi.', contact: { email: CONTACT } },
  servers: [{ url: API_URL }],
  components: {
    securitySchemes: { partnerKey: { type: 'http', scheme: 'bearer', description: 'Clé API partenaire ikb_live_…' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } } } } } } },
      Insights: { type: 'object', properties: { generatedAt: { type: 'string', format: 'date-time' }, available: { type: 'boolean' }, reason: { type: 'string' }, communities: { type: 'object' }, members: { type: 'integer' }, completedCycles: { type: 'integer' }, contributions: { type: 'object' }, note: { type: 'string' } } },
    },
  },
  paths: {
    '/partner/v1/ping': { get: { summary: 'Vérifier la clé', security: [{ partnerKey: [] }], responses: { 200: { description: 'Clé valide' }, 401: { description: 'Clé invalide', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } } },
    '/partner/v1/insights': { get: { summary: 'Statistiques agrégées', security: [{ partnerKey: [] }], responses: { 200: { description: 'Statistiques', content: { 'application/json': { schema: { $ref: '#/components/schemas/Insights' } } } }, 401: { description: 'Clé invalide' }, 403: { description: 'Droit insights:read manquant' }, 429: { description: 'Trop de requêtes' } } } },
    '/v1/developers/key-requests': { post: { summary: 'Demander une clé API', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['orgName', 'orgType', 'country', 'contactName', 'email', 'useCase', 'consent'], properties: { orgName: { type: 'string' }, orgType: { type: 'string', enum: ['banque', 'imf', 'cooperative', 'association', 'ong', 'entreprise', 'developpeur', 'autre'] }, country: { type: 'string', minLength: 2, maxLength: 2 }, contactName: { type: 'string' }, email: { type: 'string', format: 'email' }, phone: { type: 'string' }, website: { type: 'string', format: 'uri' }, useCase: { type: 'string', minLength: 30 }, volume: { type: 'string', enum: ['<100', '100-1000', '1000-10000', '>10000'] }, consent: { type: 'boolean', const: true } } } } } }, responses: { 201: { description: 'Demande enregistrée' }, 400: { description: 'Champs invalides' }, 429: { description: 'Trop de demandes' } } } },
    '/v1/health': { get: { summary: 'État de l’API', responses: { 200: { description: 'Opérationnelle' }, 503: { description: 'En configuration' } } } },
  },
};

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------
function writeTree(out, map, { nav, footer, canonicalBase, brandSuffix }) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'assets', 'fonts'), { recursive: true });
  copyFileSync(join(SRC, 'style.css'), join(out, 'assets', 'style.css'));
  copyFileSync(join(SRC, 'main.js'), join(out, 'assets', 'main.js'));
  for (const f of readdirSync(join(SRC, 'fonts'))) copyFileSync(join(SRC, 'fonts', f), join(out, 'assets', 'fonts', f));
  writeFileSync(join(out, 'favicon.svg'), logo(64).replace('width="64" height="64" aria-hidden="true"', 'xmlns="http://www.w3.org/2000/svg"'));
  for (const [path, p] of Object.entries(map)) {
    let html = layout({ ...p, path, nav, footer, canonicalBase, brandSuffix });
    if (p.jsonld) html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(p.jsonld)}</script>\n</head>`);
    const file = path === '/' ? 'index.html' : `${path.slice(1)}.html`;
    writeFileSync(join(out, file), html);
  }
}

writeTree(SITE_OUT, pages, { nav: siteNav, footer: siteFooter, canonicalBase: SITE_URL, brandSuffix: '' });
writeFileSync(join(SITE_OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
writeFileSync(join(SITE_OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(pages).filter((p) => p !== '/404').map((p) => `  <url><loc>${SITE_URL}${p === '/' ? '/' : p}</loc><lastmod>2026-11-10</lastmod></url>`).join('\n')}\n</urlset>\n`);
// Apache (Hostinger) : URL sans .html, anciennes routes de l'app Horizons redirigées, en-têtes de sécurité.
writeFileSync(join(SITE_OUT, '.htaccess'), `Options -Indexes
ErrorDocument 404 /404.html
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]
RewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]
RewriteRule ^(login|signup|forgot-password|blog)/?$ / [L,R=301]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_FILENAME}.html -f
RewriteRule ^(.+?)/?$ $1.html [L]
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "DENY"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  Header always set Strict-Transport-Security "max-age=31536000"
  Header always set Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'"
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 7 days"
  ExpiresByType application/javascript "access plus 7 days"
  ExpiresByType font/woff2 "access plus 1 year"
  ExpiresByType image/png "access plus 30 days"
  ExpiresByType image/svg+xml "access plus 30 days"
</IfModule>
`);

writeTree(PORTAL_OUT, portalPages, { nav: portalNav, footer: portalFooter, canonicalBase: API_URL, brandSuffix: '<small>API</small>' });
writeFileSync(join(PORTAL_OUT, 'openapi.json'), JSON.stringify(openapi, null, 2));
writeFileSync(join(PORTAL_OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /v1/\nDisallow: /partner/\nDisallow: /webhooks/\n`);
console.log(`Site : ${Object.keys(pages).length} pages → ${SITE_OUT}\nPortail : ${Object.keys(portalPages).length} pages → ${PORTAL_OUT}`);
