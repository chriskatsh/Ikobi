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
| `revenue:service` | Produit | Frais de service iKobi |
| `fees:processing:awa` | Passif | Frais de paiement dus à la passerelle |

## Écritures
| Événement | Débit | Crédit |
|---|---|---|
| Cotisation collectée (voir « Écritures liées aux frais ») | `clearing:awa` | `pool:<t>` ; `fees:processing:awa` |
| Règlement (relevé AWA) | `cash:awa` | `clearing:awa` |
| Versement réussi (voir « Écritures liées aux frais ») | `pool:<t>` | `cash:awa` ; `revenue:service` ; `fees:processing:awa` |

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

## Frais (grille active, validée le 10/11/2026)
| Opération | Composante | Taux | Sens |
|---|---|---|---|
| Cotisation (dépôt) | Frais de paiement | 3,5 % | Ajoutés au montant payé par le membre |
| Versement (retrait) | Frais de retrait | 3 % | Déduits de la cagnotte |
| Versement (retrait) | Frais de service iKobi | 2 % | Déduits de la cagnotte |

Exemple : cotisation 20 000 FC → 20 700 FC payés. Cagnotte 140 000 FC → 2 800 FC de service + 4 200 FC de retrait → 133 000 FC nets.
Règles dans `fee_rules` (colonne `component` : `processing` | `service`), modifiables par l'admin (`/v1/ops/fee-rules`), arrondi au franc supérieur par composante.

### Écritures liées aux frais
| Événement | Débit | Crédit |
|---|---|---|
| Cotisation collectée (P, frais de paiement f) | `clearing:awa` P+f | `pool:<t>` P ; `fees:processing:awa` f |
| Règlement brut (relevé = P+f) | `cash:awa` P+f | `clearing:awa` P+f |
| Règlement net (relevé = P) | `cash:awa` P ; `fees:processing:awa` f | `clearing:awa` P+f |
| Versement (G brut, s service, r retrait) | `pool:<t>` G | `cash:awa` G−s−r ; `revenue:service` s ; `fees:processing:awa` r |

`fees:processing:awa` est un compte de passage (frais dus à la passerelle) : il se solde lors du rapprochement avec les relevés AWA.

## Réconciliation
`GET /v1/ops/reconciliation` : balance du grand livre (équilibrée ?), encaissé non réglé par fournisseur, paiements en attente depuis plus de 30 min, demandes de versement en attente, versements échoués.

## Non couvert (en attente d'AWA)
Remboursements/annulations, format des relevés de règlement, confirmation B2C, codes d'erreur.
