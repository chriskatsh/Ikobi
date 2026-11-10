# iKobi — Architecture

```
 App iOS/Android (Expo)      WhatsApp (Meta Cloud API)        Équipe Ikobi (API /v1/ops)
          │                          │                                   │
          └──────────────► API Ikobi (Node 22, Express) ◄────────────────┘
                              │   ├─ auth (OTP WhatsApp, JWT, rôles plateforme)
                              │   ├─ tontine (groupes, tours, cotisations, versements)
                              │   ├─ ledger (partie double, ajout seul)
                              │   ├─ fees (règles par pays/fournisseur/opérateur/type)
                              │   ├─ payments (orchestrateur → adaptateurs)
                              │   ├─ audit (journal en ajout seul)
                              │   ├─ bot (WhatsApp) · notify (push + WhatsApp) · reminders
                              │
                    MySQL (Hostinger)         AWA Network (C2B, B2C, /status, callbacks)
```

## Modules (`api/src`)
| Fichier | Rôle |
|---|---|
| `services/payments.js` | Orchestrateur : route (pays, opérateur, devise) → fournisseur. RDC → AWA (CDF). Gabon : aucun fournisseur tant qu'aucun accord. |
| `services/awa.js` | Adaptateur AWA : signature HMAC-SHA512, formats de numéro par opérateur, statuts, vérification des callbacks. |
| `services/ledger.js` | Écritures équilibrées, uniques par événement, balance de vérification. |
| `services/fees.js` | Devis de cotisation (frais ajoutés) et de versement (frais déduits). |
| `services/tontine.js` | Règles métier, machine à états des tours et des transactions. |
| `services/audit.js` | Traçabilité des actions sur l'argent et l'identité. |
| `routes/webhooks.js` | Callbacks fournisseurs (anti-rejeu, montant, reconfirmation) et WhatsApp (signature Meta). |
| `routes/ops.js` | Réconciliation, file de versements, règlements, frais, audit. |

## Machines à états
- **Tour** : `scheduled → open → ready → paying_out → closed` (retour `paying_out → ready` si échec).
- **Cotisation** : `pending → success | failed` ; puis `unsettled → settled`.
- **Demande de versement** : `requested → approved → executed` | `rejected` | `failed`.
- **Versement** : `pending → success | failed`.

## Flux de données clés
1. Cotisation : devis → `payment_c2b` (order_id = référence Ikobi) → callback signé → reconfirmation `/status` → écriture « collectée ».
2. Règlement : relevé AWA → `/ops/settlements` (rapprochement exact) → écriture `cash ← clearing`.
3. Versement : demande organisateur → validation finance (préconditions) → `payment_b2c` → callback → écriture `pool → cash`.

## Déploiement
- `main` → déploiement automatique sur `api.ikobi.app` (Hostinger). **Toute branche de travail est validée avant fusion.**
- Variables d'environnement dans hPanel ; en production l'API refuse de démarrer (mode 503 « configuration incomplète ») si une clé manque, et refuse le simulateur AWA.
- App : EAS Build / Submit.

## À venir
File de tâches (paiements, notifications), staging séparé, observabilité (erreurs, métriques), sauvegardes testées.
