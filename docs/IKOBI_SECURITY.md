# iKobi — Modèle de sécurité

## Identité et accès
- Connexion par code à usage unique envoyé sur WhatsApp (6 chiffres, haché HMAC, 10 min, 5 essais, 5 codes/heure/numéro, limite par IP).
- JWT 60 jours ; comptes supprimés refusés.
- Rôles plateforme : `ops` (lecture), `finance` (règlements, versements), `compliance` (audit), `admin` (frais, rôles). Attribution initiale par `PLATFORM_ADMIN_PHONES`, tracée.
- Séparation des tâches : l'organisateur demande, la finance valide ; personne ne valide sa propre demande ni un versement dont il est bénéficiaire.

## Argent
- Grand livre en partie double, en ajout seul, écritures uniques par événement.
- Versement conditionné à : cotisations collectées **et réglées**, solde au grand livre suffisant, validation humaine.
- Verrou d'état (`ready → paying_out`) : impossible de verser deux fois un tour (testé en concurrence).
- Un paiement incertain n'est jamais déclaré échoué : vérification fournisseur, sinon réconciliation.

## Fournisseurs de paiement (AWA)
- Clés côté serveur uniquement (variables Hostinger), jamais dans l'app ni le dépôt.
- Requêtes et callbacks signés HMAC-SHA512 ; comparaison en temps constant ; marchand vérifié.
- Anti-rejeu : empreinte unique (signature + corps) dans `provider_events` ; machine à états idempotente.
- Montant annoncé comparé au montant attendu ; écart ⇒ rien n'est appliqué, alerte d'audit.
- Tout succès annoncé est reconfirmé par `/status` avant écriture.
- Simulateur AWA interdit en production.

## WhatsApp
- Signature `X-Hub-Signature-256` vérifiée ; jeton de vérification du webhook.
- Le code PIN n'est jamais demandé : validation sur l'écran de l'opérateur ; alerte si un membre tape un PIN dans le chat.

## Données
- Membres d'une tontine : nom + 4 derniers chiffres du numéro uniquement.
- Réponses API `Cache-Control: no-store` (CDN).
- Suppression de compte dans l'app (bloquée pendant une tontine active).

## Restant à faire (Phase 2)
KYC et seuils, authentification renforcée pour actions sensibles, gestion des appareils, détection de connexions suspectes, chiffrement des pièces d'identité, rotation des secrets, revue de sécurité indépendante, sauvegardes chiffrées testées.
