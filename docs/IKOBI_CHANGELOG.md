# iKobi — Journal des changements

## Refonte UX/UI (10/11/2026)
- Audit UX (`docs/IKOBI_UX_AUDIT.md`) : 14 constats priorisés, personas, principes.
- App : polices de la marque, icônes, carte « prochaine action », création en 3 étapes avec montants suggérés et dates rapides, aperçu avant adhésion (`GET /v1/groups/preview`), page tontine à onglets avec action fixe, paiement avec grille d'opérateurs, attente guidée et reçu partageable, squelettes, erreurs avec « Réessayer », toasts, vouvoiement.
- Site : vitrine de l'application avec captures réelles.

## V3.0 — Phase 1 (branche `v3-phase1`, en attente de validation)
### Ajouté
- Grand livre en partie double (`ledger_journals`, `ledger_entries`), balance de vérification.
- Journal d'audit (`audit_log`) et événements fournisseurs (`provider_events`).
- Moteur de frais (`fee_rules`), devis `GET /v1/groups/:id/contributions/quote`.
- Versement à double validation : `POST /v1/groups/:id/cycles/:n/payout-request`, `POST /v1/ops/payout-requests/:id/review`.
- Règlement rapproché : `POST /v1/ops/settlements` ; réconciliation `GET /v1/ops/reconciliation` ; audit `GET /v1/ops/audit` ; frais `/v1/ops/fee-rules`.
- Rôles plateforme et amorçage par `PLATFORM_ADMIN_PHONES`.
- **AWA Network** : adaptateur (C2B, B2C, status, callbacks HMAC-SHA512), webhook `/webhooks/awa`.
- App : récapitulatif des frais, prévu/collecté/réglé/versé, « Ma participation », « Règles », états de la demande de versement.
- 15 nouveaux tests (38 au total).

### Modifié
- MOKO retiré (remplacé par AWA Network). Variables `MOKO_*` remplacées par `AWA_*`.
- Devises : CDF uniquement tant qu'AWA n'accepte pas l'USD.
- Accent de marque : vert.
- Textes : suppression de « partenaire agréé » et des promesses implicites ; ajout des risques et des frais.

### Retiré
- Versement direct par l'organisateur ; mode `PAYOUT_MODE=auto`.

### En suspens
KYC, avis juridique, procédure de confirmation B2C d'AWA, interface web d'administration, retards/défauts.

## V2 — 10/11/2026 (`main`, déployé)
API tontines + app native Expo + bot WhatsApp + MOKO ; déployée sur `api.ikobi.app` (mode configuration incomplète).
