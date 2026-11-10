# iKobi — Design system

Source : `mobile/src/theme.ts`, `mobile/src/ui/index.tsx`, `mobile/src/operators.tsx`.

## Couleurs
| Jeton | Valeur | Usage |
|---|---|---|
| `bg` | `#090C15` | Fond (bleu nuit profond, couleur historique de la marque) |
| `surface` / `surface2` | `#121726` / `#1A2133` | Cartes, champs |
| `border` | `#262F45` | Séparateurs |
| `text` / `muted` / `faint` | `#F4F6FB` / `#9AA3B8` / `#5F6880` | Texte |
| `gold` (accent) | `#2BD9A0` | **Accent principal vert** : boutons, montants clés (nom technique conservé) |
| `green` | `#2BD9A0` | Succès |
| `red` | `#FF6B6B` | Erreur, retard |

## Typographie
Police système ; titres 28/800, sous-titres 19/700, texte 16, secondaire 15, étiquettes 13 majuscules.

## Composants
`Screen`, `Card`, `Button` (primary, secondary, ghost, danger, whatsapp), `Field`, `Choice` (radio), `Pill` (neutral, green, gold, red), `Progress`, `ErrorBox`, `Loading`, `OperatorBadge`, `AcceptedOperators`.

## Règles UX
- Montants lisibles, devise toujours affichée (`20 000 FC`).
- Avant tout paiement : récapitulatif principal / frais / total.
- États séparés et nommés : prévu, collecté, réglé, versé ; en attente, réussi, échoué.
- Chaque parcours critique : chargement, succès, échec, vide, validation, action suivante.
- Pas de promesse de sécurité absolue ni de garantie de versement.
- Cibles tactiles ≥ 44 px, rôles d'accessibilité sur boutons, radios et barres de progression.

## À faire
Logos officiels des opérateurs, mode clair, tailles dynamiques, tests aux largeurs 320 / 375 / 390 / 430 px et tablette.
