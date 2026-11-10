# iKobi — Audit UX/UI de l'application mobile

_10 novembre 2026. Méthode : parcours réels dans l'aperçu (390 px), heuristiques de Nielsen, conventions des apps de paiement mobile, contraintes du public (littératie numérique variable, réseau instable, téléphones d'entrée de gamme, usage en français avec mots de lingala)._

## Personas de référence
- **Mama Nsimba, 46 ans, commerçante à Matete.** Android d'entrée de gamme, M-Pesa au quotidien, lit le français sans aisance. Veut savoir en un coup d'œil « combien, avant quand, et est-ce que c'est passé ».
- **Christian, 31 ans, organisateur d'une tontine de bureau.** À l'aise avec le numérique. Veut inviter vite, voir qui traîne et déclencher le versement sans discussion.
- **Grâce, 24 ans, membre invitée.** Reçoit un code sur WhatsApp. Veut savoir à quoi elle s'engage avant de rejoindre.

## Constats priorisés

| # | Écran | Problème | Gravité | Principe | Correction |
|---|---|---|---|---|---|
| 1 | Accueil | Aucune « prochaine action » : il faut lire chaque carte pour savoir quoi faire | Élevée | Visibilité de l'état | Carte héros unique : payer / recevoir / rien à faire, avec montant, échéance et bouton |
| 2 | Création | La date se tape au format AAAA-MM-JJ, sans validation visuelle | Élevée | Prévention des erreurs | Choix rapides (aujourd'hui, lundi prochain, 1er du mois) et sélecteur par jours |
| 3 | Création | Formulaire unique de 8 champs, sans aperçu des conséquences | Élevée | Charge cognitive | Assistant en 3 étapes, montants suggérés, compteur de membres, récapitulatif vivant |
| 4 | Adhésion | On rejoint une tontine sans voir son montant, sa fréquence ni l'organisateur | Élevée | Confiance, contrôle | Aperçu de la tontine avant confirmation |
| 5 | Code de connexion | Un champ unique, pas de collage automatique, renvoi immédiat sans délai | Moyenne | Efficacité | 6 cases, validation automatique au 6e chiffre, renvoi après 60 s |
| 6 | Connexion | Le nom est demandé à tout le monde, même aux comptes existants | Moyenne | Adéquation | Le nom n'est demandé qu'aux nouveaux comptes, sur un écran dédié |
| 7 | Tontine | Écran très long : tour, chiffres, participation, règles, membres et calendrier empilés | Élevée | Hiérarchie | En-tête + onglets (Tour, Membres, Calendrier, Règles) |
| 8 | Tontine / paiement | Le bouton principal défile hors de l'écran | Élevée | Visibilité | Barre d'action fixe en bas de l'écran |
| 9 | Tous | Chargement = roue plein écran ; erreur = texte sans action | Moyenne | Récupération | Squelettes de contenu, erreurs avec « Réessayer » |
| 10 | Tontine | « Copier » le code ne donne aucun retour | Faible | Retour d'action | Toast « Code copié » + vibration |
| 11 | Paiement | En attente : aucune aide si la demande n'arrive pas | Moyenne | Aide | Étapes visuelles + « Je n'ai rien reçu » (conseils, relancer après 2 min) |
| 12 | Saisie de montant | Pas de séparateur de milliers : « 100000 » se lit mal | Moyenne | Lisibilité | Formatage en direct « 100 000 » |
| 13 | Numéro | Le préfixe +243 n'est pas visible ; l'utilisateur hésite entre 081… et 243… | Moyenne | Reconnaissance | Préfixe +243 fixe, formatage 81 234 5678, opérateur détecté |
| 14 | Membres | Liste sans repère visuel (avatars) | Faible | Reconnaissance | Initiales colorées stables par personne |

## Principes retenus
1. **Une prochaine action par écran**, toujours visible (barre fixe).
2. **Argent d'abord** : montant, échéance et statut en premier, en gros, avec la devise.
3. **Statuts nommés de la même façon partout** : à payer, en attente, payé, reçoit ; prévu, collecté, réglé, versé.
4. **Montrer avant d'engager** : aperçu avant adhésion, récapitulatif avant création et avant paiement.
5. **Récupérable** : chaque erreur dit quoi faire et propose une action.
6. **Calme** : animations seulement pour confirmer une action (copie, paiement reçu).

## Mesures de succès proposées
Taux de création terminée, délai entre invitation et adhésion, part des cotisations payées avant l'échéance, part des paiements abandonnés en attente, tickets « je n'ai pas reçu la demande ».
