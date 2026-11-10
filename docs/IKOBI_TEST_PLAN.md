# iKobi — Plan de tests et résultats

Commande : `cd api && npm test` (SQLite en mémoire, faux fournisseur, faux WhatsApp).
**Résultat au 10/11/2026 : 38 tests, 38 réussis, 0 échec.**

## Scénarios critiques du cahier des charges
| Scénario | Test | Résultat |
|---|---|---|
| Callbacks de paiement dupliqués | `finance` — une seule écriture comptable | ✅ |
| Échec tardif après succès | `finance` — ignoré | ✅ |
| Callback avec montant différent | `finance` — rien crédité, alerte | ✅ |
| Référence inconnue | `finance` — tracée, sans effet | ✅ |
| Interruption réseau | `tontine` — AWA injoignable ⇒ « en attente » | ✅ |
| Paiement en attente ancien | `finance` — jamais marqué échoué à l'aveugle | ✅ |
| Échec partiel des cotisations | `tontine` — échec puis nouvel essai | ✅ |
| Versements concurrents | `finance` — un seul exécuté | ✅ |
| Versement non autorisé | `finance` + `tontine` — membre, auto-validation refusés | ✅ |
| Escalade de privilèges (accès ops) | `finance` — 403 | ✅ |
| Calcul de frais | `finance` — 3 % cotisation, 2,8 % versement | ✅ |
| Écart de règlement | `finance` — relevé faux refusé, rien modifié | ✅ |
| Versement avant règlement | `finance` — bloqué | ✅ |
| Échec du versement | `finance` — tour remis en attente, fonds conservés au grand livre | ✅ |
| Grand livre équilibré, cagnotte soldée | `finance` | ✅ |
| Signature AWA (requête, callback, marchand) | `tontine` | ✅ |
| Production : simulateur et clés manquantes refusés | `tontine` | ✅ |
| Devises : USD refusé via AWA, Gabon sans fournisseur | `tontine` | ✅ |
| Bot WhatsApp : cotisation en chat, doublons Meta, signature | `bot` | ✅ |
| Rappels envoyés une seule fois | `bot` | ✅ |

## Tests manuels (aperçu web de l'app, API locale)
Connexion, création, adhésion, démarrage, cotisation avec frais affichés (20 000 + 600 = 20 600 FC), attente, confirmation, écran tontine (prévu/collecté/réglé/versé) : ✅ sans erreur JavaScript.

## Non testé (accès externe requis)
- Appels réels à AWA Network (aucune clé fournie).
- Envoi réel WhatsApp (modèles non approuvés).
- Builds iOS/Android signés, sur appareils réels.
- Défaut de membre, annulation de tontine, KYC refusé, fraude au parrainage : fonctionnalités Phase 2+.
- Charge, sécurité indépendante, restauration de sauvegarde.
