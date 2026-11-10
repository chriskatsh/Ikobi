import { Card, H2, Muted, Screen } from '@/ui';

// Texte de base à faire valider par un juriste avant publication.
const SECTIONS = [
  {
    title: 'Ce que fait iKobi',
    text: 'iKobi aide des groupes de personnes qui se connaissent à organiser une tontine (likelemba) : suivi des membres, des tours, des cotisations et des versements. Les paiements passent par les opérateurs Mobile Money via la passerelle de paiement AWA Network. iKobi n’est ni une banque ni un établissement de paiement.',
  },
  {
    title: 'Données collectées',
    text: 'Votre numéro de téléphone, votre nom, les tontines dont vous faites partie et l’historique de vos cotisations. Nous ne collectons ni votre code PIN Mobile Money, ni votre position, ni vos contacts.',
  },
  {
    title: 'Qui voit quoi',
    text: 'Les membres d’une tontine voient votre nom, les 4 derniers chiffres de votre numéro et si vous avez payé le tour en cours. Personne d’autre n’y a accès. Nous ne vendons jamais vos données.',
  },
  {
    title: 'WhatsApp',
    text: 'Si vous utilisez l’assistant iKobi, vos messages sont traités via WhatsApp Business (Meta) uniquement pour exécuter vos demandes : cotiser, consulter votre statut, rejoindre une tontine.',
  },
  {
    title: 'Risques',
    text: 'Une tontine repose sur l’engagement de chaque membre : un membre peut payer en retard ou ne pas payer. iKobi ne garantit pas le versement d’une cagnotte tant que toutes les cotisations n’ont pas été collectées et réglées. Aucun rendement n’est promis.',
  },
  {
    title: 'Frais',
    text: 'Les frais éventuels (opérateur, traitement) sont affichés avant chaque paiement, avec le total à payer. Rien n’est prélevé sans être affiché.',
  },
  {
    title: 'Responsabilité',
    text: 'Chaque groupe choisit ses membres et ses règles. iKobi fournit l’outil et la transparence ; l’engagement de cotiser reste celui de chaque membre envers son groupe.',
  },
  {
    title: 'Suppression',
    text: 'Vous pouvez supprimer votre compte depuis votre profil, ou écrire à contact@ikobi.app. Les données de paiement peuvent être conservées le temps exigé par la loi.',
  },
];

export default function Legal() {
  return (
    <Screen>
      {SECTIONS.map((s) => (
        <Card key={s.title}>
          <H2>{s.title}</H2>
          <Muted>{s.text}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
