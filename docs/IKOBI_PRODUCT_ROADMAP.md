# iKobi — Feuille de route V3.0

Principe : chaque phase livre du testé et du réversible ; rien de financier ou réglementaire en production sans validation.

## Phase 1 — Audit et stabilisation ✅ (branche `v3-phase1`, à valider)
- Grand livre double entrée, journal d'audit, événements fournisseurs anti-rejeu.
- Moteur de frais + récapitulatif avant paiement.
- Versement : demande → validation finance → exécution ; règlement rapproché au centime.
- AWA Network à la place de MOKO ; CDF uniquement.
- Textes honnêtes, marque verte, écrans « prévu / collecté / réglé / versé ».

## Phase 2 — Moteur financier et conformité (prochaine)
| Priorité | Livrable | Dépendance externe |
|---|---|---|
| P0 | KYC : pièce d'identité, selfie, revue manuelle, statut + historique ; versement interdit sans KYC vérifié au-delà d'un seuil | Choix d'un fournisseur KYC/liveness |
| P0 | Avis juridique sur la détention des fonds ; structuration via entité agréée | Juriste RDC, BCC |
| P0 | Obtenir d'AWA : Confirmation Types, codes d'erreur, relevés de règlement | AWA Network |
| P1 | Interface web « tour de contrôle » (file de versements, réconciliation, audit, frais) | — |
| P1 | Retards et défauts : pénalités configurables, exclusion, remplacement d'un membre | Règles à valider |
| P1 | Authentification renforcée pour actions sensibles ; gestion des appareils et sessions | — |
| P1 | Annulation d'une tontine et remboursement des fonds non versés | Remboursements AWA |

## Phase 3 — UX premium
Site public (accueil, fonctionnement, tarifs, sécurité, centre d'aide), onboarding guidé, FR/EN, accessibilité, états vides/erreur/chargement partout, tests aux largeurs 320–430 px, tablette, bureau.

## Phase 4 — Omnicanal et intelligence
PWA installable (consultation hors ligne non sensible), moteur de notifications (préférences, consentement, relances, dédoublonnage), assistant IA (explications, rappels, signalement pour revue humaine — jamais de mouvement de fonds), architecture USSD.

## Phase 5 — Croissance et B2B
Trust Score explicable (0–100, pondérations configurables, testé contre la manipulation), programme ambassadeurs (commission sur revenus réalisés uniquement), portail banques/IMF, configuration du pilote EDG (hypothèse : 500 femmes, 25 communautés, 180 jours — non signé), simulations de rentabilité.

## Phase 6 — Qualité et lancement
Tests de charge, revue de sécurité indépendante, sauvegardes testées, staging séparé, CI/CD, soumission App Store / Google Play.
