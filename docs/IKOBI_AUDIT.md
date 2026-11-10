# iKobi — Audit V3.0 (Phase 1)

_Date : 10 novembre 2026 · Branche : `v3-phase1`_

## 1. Périmètre inspecté

| Élément | Accès | Constat |
|---|---|---|
| Dépôt `chriskatsh/ikobi` (API + app mobile) | Complet | Code lu, testé, exécuté localement |
| Hébergement Hostinger (`api.ikobi.app`) | API Hostinger | Site Node.js, MySQL `u582518266_ikobi`, SSL actif, déploiement auto depuis `main` |
| Ancienne app `ikobi.app` (Hostinger Horizons) | **Partiel** | Publiée le 3 sept. 2026 ; Horizons n'expose pas son code ni sa base. Pages connues par le sitemap : accueil, login, signup, forgot-password, blog, politiques. **Non auditée en profondeur.** |
| Données de production | — | Aucune : l'utilisateur confirme l'absence d'utilisateurs réels. L'API de production est en « configuration incomplète » (aucune transaction possible). |
| AWA Network | Doc publique `docs.awanetwork.tech` (v5.7.2) | Lue. Plusieurs points non documentés (voir §4). |

## 2. Architecture constatée

- **API** : Node.js 22, Express, MySQL (knex), JWT, validation zod, migrations versionnées en ajout seul.
- **App** : Expo SDK 58 / React Native (iOS + Android natifs), Expo Router, stockage sécurisé (Keychain/Keystore).
- **Canaux** : app native, chatbot WhatsApp (Cloud API Meta), notifications push Expo.
- **Paiement** : orchestrateur multi-fournisseurs, adaptateur **AWA Network** (MOKO retiré à la demande du client).
- **Rôles** : membre, organisateur (par tontine), équipe plateforme (`ops`, `finance`, `compliance`, `admin`).

## 3. Constats classés

### P0 — Risques financiers, sécurité, intégrité (état après Phase 1)

| # | Constat (avant) | Statut |
|---|---|---|
| P0-1 | Aucun grand livre : soldes déduits des statuts de transaction | ✅ Grand livre en partie double, ajout seul, journaux idempotents |
| P0-2 | L'organisateur pouvait verser la cagnotte seul, sans contrôle | ✅ Demande (organisateur) → validation (finance Ikobi), séparation des tâches |
| P0-3 | Versement possible dès « collecté », sans preuve de règlement | ✅ Versement bloqué tant que les cotisations ne sont pas **réglées** (relevé fournisseur rapproché au centime) et que le solde au grand livre ne couvre pas la cagnotte |
| P0-4 | Paiement ancien « en attente » marqué « échoué » à l'aveugle | ✅ Jamais d'échec supposé : vérification fournisseur, sinon blocage + réconciliation |
| P0-5 | Callbacks : pas de trace brute ni d'anti-rejeu | ✅ Table `provider_events` (empreinte unique), contrôle du montant annoncé, reconfirmation par `/status` avant tout crédit |
| P0-6 | Frais non affichés avant paiement | ✅ Moteur de frais configurable + récapitulatif (principal, frais, total) dans l'app et sur WhatsApp |
| P0-7 | Aucune trace d'audit des actions sur l'argent | ✅ `audit_log` en ajout seul (initiation, succès, échec, demande, validation, refus, règlement, écart) |
| P0-8 | Textes trompeurs (« partenaire agréé », « personne ne garde l'argent ») | ✅ Corrigés ; ajout des risques et de l'absence de garantie |
| P0-9 | Devise USD proposée alors qu'AWA n'accepte que CDF | ✅ Création limitée aux devises réellement supportées |
| P0-10 | **KYC absent** alors que le versement est un retrait d'argent | ⏳ Phase 2 (fournisseur KYC à choisir) — en attendant, chaque versement est validé par un humain |
| P0-11 | **Cadre réglementaire** : fonds transitant par le compte marchand d'Ikobi | ⏳ Validation juridique requise (BCC / partenaire agréé) avant lancement |
| P0-12 | Procédure B2C « Confirmation Types » d'AWA non publiée | ⚠️ Détectée et bloquante : le versement reste en attente et la finance est alertée. À obtenir d'AWA |

### P1 — Fonctionnalités essentielles

| # | Constat | Statut |
|---|---|---|
| P1-1 | Pas d'écran membre « prévu / collecté / réglé / versé » | ✅ Ajouté |
| P1-2 | Pas de « ma participation » (total payé, position, date prévue) | ✅ Ajouté |
| P1-3 | Règles de la tontine non affichées | ✅ Carte « Règles » |
| P1-4 | Pas de tour de contrôle (réconciliation, file de versements) | ✅ API `/v1/ops/*` — **interface web d'administration à construire** |
| P1-5 | Pas de gestion des retards / défauts (pénalités, exclusion) | ⏳ Phase 2 |
| P1-6 | Sessions : pas de gestion des appareils, pas d'authentification renforcée pour actions sensibles | ⏳ Phase 2 |
| P1-7 | Ancienne app Horizons toujours en ligne avec un parcours de connexion distinct | ⏳ Décision : la remplacer par une page vitrine |

### P2 — UX, produit, performance
- Marque : accent principal passé au **vert** (bleu nuit + vert vif), conforme au brief.
- Logos officiels des opérateurs à fournir (badges de couleur en attendant).
- Multilingue (FR/EN) et accessibilité (tailles dynamiques, lecteurs d'écran) à compléter.
- Pagination des historiques, index supplémentaires dès que le volume le justifie.
- PWA / site public premium (accueil, tarifs, sécurité, centre d'aide).

### P3 — Innovation
Trust Score explicable, assistant IA, USSD, agents communautaires, programme ambassadeurs, portail banques/IMF (pilote EDG Gabon), simulations de rentabilité.

## 4. AWA Network — points à clarifier avec le fournisseur
1. En-têtes d'authentification (aucun documenté ; seule la signature HMAC-SHA512 l'est).
2. Section « Confirmation Types » du B2C (référencée, absente).
3. Liste des codes d'erreur et format des réponses d'erreur.
4. Incohérence des `provider_id` (tableau 2013/2014/2015/2071 vs énumération 9…19) — configurable via `AWA_PROVIDER_IDS`.
5. Anti-rejeu des callbacks (aucun nonce / fenêtre) — compensé côté Ikobi.
6. Remboursements / annulations (non documentés).
7. Relevés de règlement (format, fréquence) pour la réconciliation.
8. Couverture USD et Gabon / CEMAC (non supposée).

## 5. Tests
38 tests automatisés passent (voir `IKOBI_TEST_PLAN.md`). Non testé : appels réels à AWA (aucune clé), envoi réel WhatsApp, builds iOS/Android signés.
