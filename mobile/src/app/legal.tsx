import { Card, H2, Muted, Screen } from '@/ui';

// Texte de base à faire valider par un juriste avant publication.
const SECTIONS = [
  {
    title: 'Ce que fait Ikobi',
    text: 'Ikobi aide des groupes de personnes qui se connaissent à organiser une tontine (likelemba) : suivi des membres, des tours, des cotisations et des versements. Les paiements passent par les opérateurs Mobile Money via la passerelle de paiement AWA Network. Ikobi n’est ni une banque ni un établissement de paiement.',
  },
  {
    title: 'Données collectées',
    text: 'Ton numéro de téléphone, ton nom, les tontines dont tu fais partie et l’historique de tes cotisations. Nous ne collectons ni ton code PIN Mobile Money, ni ta position, ni tes contacts.',
  },
  {
    title: 'Qui voit quoi',
    text: 'Les membres d’une tontine voient ton nom, les 4 derniers chiffres de ton numéro et si tu as payé le tour en cours. Personne d’autre n’y a accès. Nous ne vendons jamais tes données.',
  },
  {
    title: 'WhatsApp',
    text: 'Si tu utilises le chatbot Ikobi, tes messages au bot sont traités via WhatsApp Business (Meta) uniquement pour exécuter tes demandes : cotiser, consulter ton statut, rejoindre une tontine.',
  },
  {
    title: 'Risques',
    text: 'Une tontine repose sur l’engagement de chaque membre : un membre peut payer en retard ou ne pas payer. Ikobi ne garantit pas le versement d’une cagnotte tant que toutes les cotisations n’ont pas été collectées et réglées. Aucun rendement n’est promis.',
  },
  {
    title: 'Frais',
    text: 'Les frais éventuels (opérateur, traitement) sont affichés avant chaque paiement, avec le total à payer. Rien n’est prélevé sans être affiché.',
  },
  {
    title: 'Responsabilité',
    text: 'Chaque groupe choisit ses membres et ses règles. Ikobi fournit l’outil et la transparence ; l’engagement de cotiser reste celui de chaque membre envers son groupe.',
  },
  {
    title: 'Suppression',
    text: 'Tu peux demander la suppression de ton compte à tout moment depuis ton profil ou à support@ikobi.app. Les données de paiement peuvent être conservées le temps exigé par la loi.',
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
