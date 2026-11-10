# iKobi — Design system

Sources : `mobile/src/theme.ts`, `mobile/src/ui/index.tsx`, `mobile/src/ui/kit.tsx`, `mobile/src/operators.tsx` (app) ; `site/src/style.css` (ikobi.app et api.ikobi.app). Audit et principes : `docs/IKOBI_UX_AUDIT.md`.

## Identité
- **Fond** bleu nuit `#090C15`, surfaces `#121726` / `#1A2133`, bordures `#262F45`.
- **Accent** vert `#2BD9A0` (actions, confirmations). Nom technique `C.gold` conservé dans l'app.
- **Or de la cagnotte** `#F2B441` : réservé au moment où l'on reçoit (carte « votre tour », bénéficiaire).
- **Rouge** `#FF6B6B` : retard, échec, suppression.
- Le même cercle (6 membres autour de la cagnotte) sert de logo, d'icône d'app et d'animation du site.

## Typographie (app et web)
| Rôle | Police | Usage |
|---|---|---|
| Titres, montants | Bricolage Grotesque 700/800 | H1 30, montants héros 44–48, titres de carte 18 |
| Texte | Instrument Sans 400/500/600/700 | Corps 15–16, libellés 14, mentions 12–13 |
| Code (web) | JetBrains Mono | Documentation API |

## Ton
Vouvoiement dans l'app, sur le site et dans les messages de l'API. Tutoiement réservé à l'assistant WhatsApp (conversationnel). Phrases courtes, verbes d'action, aucune promesse de garantie.

## Composants (app)
| Composant | Rôle |
|---|---|
| `Screen` + `ActionBar` | Écran défilant ; l'action principale reste fixée en bas |
| `Button` | primary (vert), secondary, ghost, danger, whatsapp — 54 px, pilule |
| `Card`, `KV` | Regroupement ; lignes libellé / valeur alignées |
| `Segmented` | Onglets (Tour, Membres, Calendrier, Règles ; Cotisations, Versements) |
| `PhoneInput` | Préfixe +243 fixe, groupes « 81 234 5678 », opérateur détecté |
| `AmountInput`, `Chip` | Montant géant avec séparateur de milliers, montants suggérés |
| `Stepper`, `Steps` | Compteur ±, progression d'un assistant |
| `CodeInput` | 6 cases, collage et remplissage automatique, validation au 6e caractère |
| `Avatar` | Initiales, couleur stable par personne |
| `Pill`, `Progress` | Statut (à payer, payé, reçoit, en attente) ; progression du tour |
| `SkeletonCard`, `ErrorState`, `EmptyState` | Chargement, erreur avec « Réessayer », état vide avec action |
| `useToast` | Retour bref (code copié, demande envoyée) + vibration + annonce lecteur d'écran |
| `OperatorBadge` | Badges M-Pesa, Orange Money, Airtel Money, Afrimoney |

## Règles UX
1. Une seule prochaine action par écran, toujours visible.
2. Argent d'abord : montant, échéance et statut en premier, devise toujours affichée.
3. Statuts nommés partout de la même façon : à payer, en attente, payé, reçoit ; prévu, collecté, réglé, versé.
4. Montrer avant d'engager : aperçu avant adhésion, récapitulatif avant création et avant paiement.
5. Chaque erreur dit quoi faire et propose une action.
6. Animation seulement pour confirmer (pulsation d'attente, coche de succès, toast) ; mouvement réduit respecté.
7. Cibles tactiles ≥ 44 px, rôles d'accessibilité (bouton, onglet, radio, réglable), annonces vocales des résultats de paiement.

## Vérifications
Parcours complet testé dans l'aperçu à 390 px, sans débordement à 360 px ; site sans débordement à 320 px.
