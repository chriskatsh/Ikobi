# Ikobi — la tontine (likelemba) sécurisée

*Together. Securely.*

Ikobi organise des tontines à tour de rôle entre personnes de confiance : membres, calendrier des tours, cotisations par Mobile Money (M-Pesa, Orange Money, Airtel Money, Afrimoney via **AWA Network**, en CDF) et chatbot **WhatsApp** pour cotiser directement dans le chat.

```
ikobi/
├── site/     Site public ikobi.app (source + build.mjs → site/dist) et portail api.ikobi.app (→ api/public)
├── api/      API Node.js (Express + MySQL) — tontines, paiements AWA Network, grand livre, bot WhatsApp, rappels
└── mobile/   App native iOS + Android (Expo / React Native)
```

## Règles de la tontine

- L’organisateur crée la tontine (montant, devise USD/CDF, fréquence, nombre de membres) et partage un **code d’invitation**.
- Les membres rejoignent dans l’app ou sur WhatsApp (`rejoindre CODE`). Chacun indique le numéro Mobile Money où recevoir sa cagnotte.
- Au démarrage, un tour est créé par membre (ordre d’arrivée ou tirage au sort).
- À chaque tour, **tous les membres sauf le bénéficiaire** cotisent. Cagnotte = montant × (membres − 1).
- Quand tout le monde a payé, l’organisateur **demande** le versement ; l’équipe finance Ikobi le **valide** après rapprochement du relevé AWA. Le tour suivant s’ouvre.
- Documentation V3 : `docs/IKOBI_*.md` (audit, feuille de route, architecture, sécurité, flux de paiement, design, tests, changements).
- Rappels automatiques 2 jours avant, le jour J et 2 jours après l’échéance (push + WhatsApp).

## Chatbot WhatsApp

| Message | Effet |
|---|---|
| `menu`, `bonjour`, `mbote` | Menu avec boutons |
| `cotiser` (ou `payer`, `kofuta`) | Choix de la tontine → demande Mobile Money sur le numéro WhatsApp → confirmation dans le chat |
| `cotiser 0812345678` | Payer avec un autre numéro |
| `statut` | Où en sont mes tontines, qui a payé, qui reçoit |
| `rejoindre K7PQ2M` | Rejoindre une tontine (crée le compte au besoin) |
| `aide` | Aide |

Le code PIN n’est **jamais** demandé dans le chat : l’opérateur l’affiche sur le téléphone du membre.

---

## 1. Mettre l’API en ligne (Hostinger)

1. **Sous-domaine** `api.ikobi.app` → site Node.js sur l’hébergement Hostinger.
2. **Base MySQL** dans hPanel (nom, utilisateur, mot de passe). Depuis l’app : hôte `127.0.0.1`.
3. **Variables d’environnement** : copier `api/.env.example` et remplir (Hostinger → Node.js → Variables). Générer `JWT_SECRET` et `OTP_SECRET` avec `openssl rand -hex 48`.
4. **Déploiement** depuis ce dépôt GitHub : racine `api/`, point d’entrée `src/main.js`, Node 22. Les tables se créent au premier démarrage.
5. Vérifier : `https://api.ikobi.app/v1/health` → `{"ok":true}`.

> Sans identifiants AWA, l’API tourne en **mode simulation** en développement uniquement (aucun argent réel) — pratique pour tester. En production, elle refuse de démarrer si une clé manque.

## 2. AWA Network

Demander à AWA :
- `public_id`, `merchant_id` et `secretKey` (production) → `AWA_PUBLIC_ID`, `AWA_MERCHANT_ID`, `AWA_SECRET_KEY` ;
- l'URL de callback à enregistrer : `https://api.ikobi.app/webhooks/awa` ;
- la procédure « Confirmation Types » des versements B2C, la liste des codes d'erreur et le format des relevés de règlement ;
- la confirmation des identifiants opérateurs (Orange 2013, Airtel 2014, Africell 2015, Vodacom 2071) ;
- les frais par opérateur et la disponibilité éventuelle de l'USD.

Chaque succès reçu par callback est vérifié (signature, marchand, montant) puis **reconfirmé** via `/status` avant d'être crédité.

## 3. WhatsApp — le numéro devient « Ikobi »

Le numéro WhatsApp Business utilisé jusqu’ici pour Awakazi passe aux coordonnées d’Ikobi.

1. **Nom affiché** : Meta Business Manager → WhatsApp Manager → Numéros → Modifier le nom → `Ikobi` (validation de Meta, en général 1 à 3 jours).
2. **Photo de profil** : `docs/whatsapp-profil-ikobi.png`.
3. **Description, e-mail, site, adresse** : une fois les variables `WA_*` en place sur Hostinger, lancer `npm run wa:profile` dans `api/` (ou recopier le texte de `api/scripts/wa-profile.js` dans WhatsApp Manager).
4. **Webhook** : app Meta → WhatsApp → Configuration → URL `https://api.ikobi.app/webhooks/whatsapp`, jeton = `WA_VERIFY_TOKEN`, champ `messages`.
   ⚠️ Un numéro n’a qu’un seul webhook : à partir de ce moment, les messages vont au bot Ikobi et plus au bot Awakazi.
5. Jeton d’**utilisateur système** permanent → `WA_ACCESS_TOKEN` ; secret de l’app → `WA_APP_SECRET` ; identifiant du numéro → `WA_PHONE_NUMBER_ID`.
6. Faire approuver 2 modèles (langue `fr`) :
   - `ikobi_code` — catégorie **Authentification** (bouton « Copier le code »).
   - `ikobi_rappel` — catégorie **Utilitaire** :
     `Bonjour {{1}}, ta cotisation de {{2}} pour {{3}} est attendue {{4}}. Réponds *cotiser* pour payer.`

## 4. App mobile → App Store et Google Play

Prérequis : comptes Apple Developer et Google Play Console (ok), compte Expo gratuit.

```bash
cd mobile
npm install
npx eas-cli@latest login          # ton compte Expo
npx eas-cli@latest init           # crée le projet EAS (ajoute projectId dans app.json)
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios      # vers TestFlight / App Store Connect
npx eas-cli@latest submit --platform android  # vers Google Play (piste interne)
```

- Identifiants : `app.ikobi` (iOS et Android).
- Pour tester avant les stores : `--profile preview` produit un APK Android installable directement.
- Logos officiels des opérateurs : déposer les PNG dans `mobile/assets/operators/` et les activer dans `mobile/src/operators.tsx` (sinon, badges aux couleurs des opérateurs).
- Variable `EXPO_PUBLIC_WHATSAPP_NUMBER` (ex. `243XXXXXXXXX`) dans `eas.json` pour afficher les boutons WhatsApp.
- Fiches store à préparer : captures d’écran, politique de confidentialité en ligne (ex. `https://ikobi.app/politiques`), compte de démonstration pour les testeurs Apple/Google.

## Développement

```bash
# API (tests : 38 scénarios, base SQLite en mémoire, faux fournisseur et faux WhatsApp)
cd api && npm install && npm test
DB_CLIENT=better-sqlite3 npm start        # http://localhost:3000, mode simulation

# App
cd mobile && npm install
EXPO_PUBLIC_API_URL=http://<ip-locale>:3000 npx expo start
npm run typecheck && npm run lint
```

## Sites web

- `node site/build.mjs` régénère le site public (`site/dist`) et le portail développeurs (`api/public`).
- **ikobi.app** est publié depuis la branche `site-live` (contenu de `site/dist`) : après un build, `git subtree split --prefix site/dist -b site-live` puis pousser `site-live` ; Hostinger redéploie automatiquement.
- **api.ikobi.app** sert le portail (accueil, `/docs`, `/cle-api`, `/statut`, `/openapi.json`) et l'API (`/v1`, `/partner/v1`, `/webhooks`).
- Demandes de clé : `GET /v1/ops/api-key-requests`, puis `POST /v1/ops/api-key-requests/:id/approve` (admin) — la clé n'est affichée qu'une fois.

## Point juridique

Faire valider par un juriste (et au besoin auprès de la BCC) le modèle de collecte : les fonds transitent par le compte marchand AWA d’Ikobi entre la collecte et le versement. Le texte de `mobile/src/app/legal.tsx` est une base à faire relire.
