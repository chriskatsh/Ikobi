# iKobi — Flux de paiement, grand livre et réconciliation

## Fournisseur : AWA Network
- `POST https://api.awanetwork.tech/{public_id}/payment_c2b` (collecte), `/payment_b2c` (versement), `/status`.
- `order_id` = référence Ikobi (`IKC-…` cotisation, `IKP-…` versement) : idempotent chez AWA.
- Montant `"20000.00"`, devise **CDF** uniquement, pays `CD`.
- Opérateurs : Orange 2013 (`0XXXXXXXXX`), Airtel 2014 (`XXXXXXXXX`), Africell 2015 (`0XXXXXXXXX`), Vodacom M-Pesa 2071 (`243XXXXXXXXX`).
- Statuts : 2 succès ; 3 échec, 4 annulé ⇒ échec ; 0, 1, 6, 7, −1 ⇒ en attente (jamais d'échec supposé).
- Callback : `https://api.ikobi.app/webhooks/awa`, signature dans le corps.

## Comptes du grand livre
| Compte | Nature | Sens |
|---|---|---|
| `clearing:awa` | Actif | Encaissé chez AWA, non réglé |
| `cash:awa` | Actif | Réglé sur le compte marchand |
| `pool:<tontine>` | Passif | Fonds dus à la tontine |
| `revenue:fees` | Produit | Frais Ikobi |

## Écritures
| Événement | Débit | Crédit |
|---|---|---|
| Cotisation collectée (P principal, F frais) | `clearing:awa` P+F | `pool:<t>` P ; `revenue:fees` F |
| Règlement (relevé AWA) | `cash:awa` | `clearing:awa` |
| Versement réussi (G brut, f frais) | `pool:<t>` G | `cash:awa` G−f ; `revenue:fees` f |

Chaque journal est équilibré et unique par (type, référence).

## Cotisation
1. `GET /v1/groups/:id/contributions/quote?method=` → principal, frais, total.
2. `POST /v1/groups/:id/contributions` → `payment_c2b` (total).
3. Callback signé → montant vérifié → `/status` → `success` ⇒ écriture « collectée ».
4. Sans callback : l'app interroge, l'API revérifie `/status` après 20 s.

## Règlement (finance)
`POST /v1/ops/settlements { provider, currency, references[], statementTotal, statementRef }` : toutes les références doivent être collectées, non réglées, du même fournisseur et de la même devise, et la somme doit égaler le relevé **au centime** — sinon rien n'est modifié et l'écart est journalisé.

## Versement
1. Tour `ready` (toutes cotisations collectées).
2. Organisateur : `POST /v1/groups/:id/cycles/:n/payout-request`.
3. Finance : `POST /v1/ops/payout-requests/:id/review { decision }`. Préconditions : collecté, réglé, solde `pool` ≥ cagnotte.
4. Verrou `ready → paying_out`, devis de frais de versement, `payment_b2c` (net).
5. Callback → succès ⇒ écriture, tour clos, tour suivant ouvert. Échec ⇒ tour `ready`, nouvelle demande possible.
6. Si AWA renvoie `confirm_type ≠ 0` : versement en attente + alerte (procédure à obtenir d'AWA).

## Frais (configurables, hypothèses non activées)
Aucune règle n'est active par défaut. Hypothèses du cahier des charges : 3 % cotisation, 2,8 % versement — à activer par l'admin (`POST /v1/ops/fee-rules`) après validation commerciale.

## Réconciliation
`GET /v1/ops/reconciliation` : balance du grand livre (équilibrée ?), encaissé non réglé par fournisseur, paiements en attente depuis plus de 30 min, demandes de versement en attente, versements échoués.

## Non couvert (en attente d'AWA)
Remboursements/annulations, format des relevés de règlement, confirmation B2C, codes d'erreur.
