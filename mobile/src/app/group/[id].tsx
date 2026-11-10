import * as Clipboard from 'expo-clipboard';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import { api, ApiError, type GroupDetail } from '@/lib/api';
import { dateFr, dueLabel, FREQ, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, H1, H2, Label, Loading, Muted, Pill, Progress, Screen, T } from '@/ui';
import { C, S } from '@/theme';

const WA_BOT = process.env.EXPO_PUBLIC_WHATSAPP_NUMBER || '';

export default function Group() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { user } = useSession();
  const [g, setG] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setG(await api<GroupDetail>(`/groups/${id}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!g) return error ? <Screen><ErrorBox message={error} /></Screen> : <Loading />;

  const c = g.currentCycle;
  const isAdmin = g.myRole === 'admin';
  const beneficiary = c ? g.members.find((m) => m.id === c.beneficiaryId) : null;

  async function share() {
    await Share.share({
      message:
        `Rejoins ma tontine « ${g!.name} » sur Ikobi 🤝\n` +
        `${money(g!.amount, g!.currency)} ${FREQ[g!.frequency].toLowerCase()}.\n\n` +
        `Code d'invitation : ${g!.inviteCode}\n` +
        (WA_BOT ? `Ou sur WhatsApp : https://wa.me/${WA_BOT}?text=${encodeURIComponent('rejoindre ' + g!.inviteCode)}` : ''),
    });
  }

  async function start() {
    Alert.alert(
      'Démarrer la tontine ?',
      `${g!.members.length} membres · ${g!.members.length} tours. Plus personne ne pourra rejoindre ensuite.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Ordre d’arrivée', onPress: () => doStart('join') },
        { text: 'Tirage au sort', onPress: () => doStart('random') },
      ],
    );
  }

  async function doStart(order: 'join' | 'random') {
    setBusy('start');
    try {
      setG(await api<GroupDetail>(`/groups/${id}/start`, { body: { order } }));
    } catch (e) {
      Alert.alert('Impossible de démarrer', e instanceof ApiError ? e.message : 'Erreur');
    } finally {
      setBusy(null);
    }
  }

  async function requestPayout() {
    Alert.alert(
      'Demander le versement ?',
      `${money(g!.pot, g!.currency)} pour ${beneficiary?.name ?? 'le bénéficiaire'}. L’équipe Ikobi vérifie que les fonds sont bien réglés avant d’envoyer l’argent.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Demander',
          onPress: async () => {
            setBusy('payout');
            try {
              await api(`/groups/${id}/cycles/${c!.number}/payout-request`, { method: 'POST' });
              await load();
            } catch (e) {
              Alert.alert('Demande impossible', e instanceof ApiError ? e.message : 'Erreur');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  const req = c?.payoutRequest;
  const canRequest = isAdmin && c?.status === 'ready' && (!req || req.status === 'rejected' || req.status === 'failed');

  return (
    <Screen
      refreshControl={
        <RefreshControl
          tintColor={C.gold}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ gap: S.xs }}>
        <H1>{g.name}</H1>
        <Muted>
          {money(g.amount, g.currency)} · {FREQ[g.frequency]} · {g.members.length}/{g.maxMembers} membres
        </Muted>
      </View>

      <Card style={{ alignItems: 'center', paddingVertical: S.lg }}>
        <Label>{g.status === 'forming' ? 'Cagnotte prévue par tour' : 'Cagnotte par tour'}</Label>
        <Text style={s.pot}>{money(g.status === 'forming' ? g.amount * (g.maxMembers - 1) : g.pot, g.currency)}</Text>
        {g.status === 'forming' ? <Muted>avec {g.maxMembers} membres · {g.members.length} pour l’instant</Muted> : null}
        {g.status === 'active' && c ? (
          <Muted>
            Tour {c.number}/{g.totalCycles} · pour {c.iAmBeneficiary ? 'toi 🎁' : beneficiary?.name}
          </Muted>
        ) : null}
        {g.status === 'completed' ? <Pill text="Tontine terminée ✓" tone="green" /> : null}
      </Card>

      {g.status === 'forming' && (
        <Card>
          <H2>Invite les membres</H2>
          {created ? <Muted>Ta tontine est créée ! Partage ce code avec les membres.</Muted> : null}
          <Text style={s.code} selectable>
            {g.inviteCode}
          </Text>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Button title="Partager" onPress={share} style={{ flex: 1 }} />
            <Button title="Copier" variant="secondary" onPress={() => Clipboard.setStringAsync(g.inviteCode)} style={{ flex: 1 }} />
          </View>
          {isAdmin ? (
            <Button title={`Démarrer avec ${g.members.length} membre${g.members.length > 1 ? 's' : ''}`} variant="secondary" onPress={start} loading={busy === 'start'} disabled={g.members.length < 2} />
          ) : (
            <Muted>L’organisateur démarrera la tontine quand tout le monde aura rejoint.</Muted>
          )}
        </Card>
      )}

      {c && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <H2 style={{ flex: 1 }}>Tour {c.number}</H2>
            <Pill text={c.status === 'open' ? dueLabel(c.dueDate) : c.status === 'ready' ? 'Complet' : 'Versement…'} tone={c.status === 'open' && dueLabel(c.dueDate).startsWith('en retard') ? 'red' : 'gold'} />
          </View>
          <Muted>Échéance : {dateFr(c.dueDate)}</Muted>
          <Progress value={c.paidCount} total={c.expectedCount} />
          <Muted>
            {c.paidCount}/{c.expectedCount} membres ont cotisé
          </Muted>

          {c.status === 'open' && !c.iAmBeneficiary && !c.iHavePaid && (
            <Button title={`Cotiser ${money(g.amount, g.currency)}`} onPress={() => router.push({ pathname: '/pay/[id]', params: { id: String(g.id) } })} />
          )}
          {c.iHavePaid && <Pill text="Tu as payé ce tour ✓" tone="green" />}
          {c.iAmBeneficiary && <Pill text="C’est ton tour de recevoir 🎁" tone="green" />}

          <View style={s.fin}>
            <Amount label="Prévu" value={money(c.scheduled, g.currency)} />
            <Amount label="Collecté" value={money(c.collected, g.currency)} />
            <Amount label="Réglé" value={money(c.settled, g.currency)} />
            <Amount label="Versé" value={money(c.paid, g.currency)} />
          </View>
          {c.pendingPayments > 0 ? <Muted style={{ fontSize: 13 }}>{c.pendingPayments} paiement(s) en attente de confirmation de l’opérateur</Muted> : null}

          {c.status === 'ready' && req?.status === 'requested' && <Pill text="Versement en attente de validation Ikobi" tone="gold" />}
          {c.status === 'paying_out' && <Pill text="Versement en cours d’envoi…" tone="gold" />}
          {req?.status === 'rejected' && <ErrorBox message={`Versement refusé${req.note ? ` : ${req.note}` : ''}`} />}
          {req?.status === 'failed' && <ErrorBox message="Le dernier versement a échoué chez l’opérateur. Une nouvelle demande est possible." />}
          {canRequest && <Button title={`Demander le versement (${money(g.pot, g.currency)})`} onPress={requestPayout} loading={busy === 'payout'} />}
          {c.status === 'ready' && !isAdmin && !req && <Muted>Toutes les cotisations sont collectées : l’organisateur va demander le versement.</Muted>}
        </Card>
      )}

      {WA_BOT && c?.status === 'open' && !c.iAmBeneficiary && !c.iHavePaid ? (
        <Button title="Cotiser sur WhatsApp" variant="whatsapp" onPress={() => Linking.openURL(`https://wa.me/${WA_BOT}?text=cotiser`)} />
      ) : null}

      {g.status !== 'forming' && (
        <Card>
          <H2>Ma participation</H2>
          <Row label="Total cotisé" value={money(g.me.totalPaid, g.currency)} />
          <Row label="Mon tour de recevoir" value={g.me.position ? `Tour ${g.me.position}/${g.totalCycles}` : '—'} />
          <Row label="Date prévue" value={g.me.expectedPayoutDate ? dateFr(g.me.expectedPayoutDate) : '—'} />
          {g.me.payoutReceived !== null ? <Row label="Cagnotte reçue" value={money(g.me.payoutReceived, g.currency)} /> : null}
          <Muted style={{ fontSize: 12 }}>La date de versement dépend de la collecte complète des cotisations du tour.</Muted>
        </Card>
      )}

      <Card>
        <H2>Règles</H2>
        <Muted>• {money(g.amount, g.currency)} par membre, {FREQ[g.frequency].toLowerCase()}.</Muted>
        <Muted>• Le bénéficiaire du tour ne cotise pas ; il reçoit {money(g.amount, g.currency)} × (membres − 1).</Muted>
        <Muted>• Le versement est envoyé quand toutes les cotisations du tour sont collectées et réglées, après validation par Ikobi.</Muted>
        <Muted>• Un membre peut payer en retard ou ne pas payer : la tontine repose sur la confiance entre membres.</Muted>
      </Card>

      <Card>
        <H2>Membres</H2>
        {g.members.map((m) => (
          <View key={m.id} style={s.member}>
            <View style={s.pos}>
              <Text style={{ color: C.muted, fontWeight: '700' }}>{m.position}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <T>
                {m.name}
                {m.id === user?.id ? ' (toi)' : ''}
              </T>
              <Muted style={{ fontSize: 13 }}>
                ••• {m.phoneEnd}
                {m.role === 'admin' ? ' · organisateur' : ''}
              </Muted>
            </View>
            {c ? (
              m.paidCurrent === null ? (
                <Pill text="Reçoit" tone="green" />
              ) : m.paidCurrent ? (
                <Pill text="Payé" tone="green" />
              ) : (
                <Pill text="En attente" />
              )
            ) : null}
          </View>
        ))}
      </Card>

      {g.cycles.length > 0 && (
        <Card>
          <H2>Calendrier des tours</H2>
          {g.cycles.map((cy) => {
            const who = g.members.find((m) => m.id === cy.beneficiaryId);
            return (
              <View key={cy.number} style={s.member}>
                <Text style={{ color: cy.status === 'closed' ? C.green : cy.status === 'scheduled' ? C.faint : C.gold, width: 24, fontWeight: '800' }}>
                  {cy.status === 'closed' ? '✓' : cy.number}
                </Text>
                <View style={{ flex: 1 }}>
                  <T>{who?.id === user?.id ? 'Toi' : who?.name}</T>
                  <Muted style={{ fontSize: 13 }}>{dateFr(cy.dueDate)}</Muted>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {g.status !== 'forming' && <Button title="Historique des paiements" variant="secondary" onPress={() => router.push({ pathname: '/history/[id]', params: { id: String(g.id) } })} />}
      <ErrorBox message={error} />
    </Screen>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: 6 }}>
      <Muted style={{ fontSize: 12 }}>{label}</Muted>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Muted>{label}</Muted>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  fin: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: S.md, paddingVertical: S.sm },
  pot: { color: C.gold, fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  code: { color: C.text, fontSize: 34, fontWeight: '900', letterSpacing: 8, textAlign: 'center', paddingVertical: S.sm },
  member: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  pos: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
});
