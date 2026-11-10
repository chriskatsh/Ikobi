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

  async function payout() {
    Alert.alert('Verser la cagnotte ?', `${money(g!.pot, g!.currency)} seront envoyés à ${beneficiary?.name ?? 'le bénéficiaire'} par Mobile Money.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Verser',
        onPress: async () => {
          setBusy('payout');
          try {
            await api(`/groups/${id}/cycles/${c!.number}/payout`, { method: 'POST' });
            await load();
          } catch (e) {
            Alert.alert('Versement impossible', e instanceof ApiError ? e.message : 'Erreur');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

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
          {isAdmin && c.status === 'ready' && <Button title={`Verser ${money(g.pot, g.currency)} à ${beneficiary?.name}`} onPress={payout} loading={busy === 'payout'} />}
          {c.status === 'ready' && !isAdmin && <Muted>Tout le monde a payé : l’organisateur va verser la cagnotte.</Muted>}
        </Card>
      )}

      {WA_BOT && c?.status === 'open' && !c.iAmBeneficiary && !c.iHavePaid ? (
        <Button title="Cotiser sur WhatsApp" variant="whatsapp" onPress={() => Linking.openURL(`https://wa.me/${WA_BOT}?text=cotiser`)} />
      ) : null}

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

const s = StyleSheet.create({
  pot: { color: C.gold, fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  code: { color: C.text, fontSize: 34, fontWeight: '900', letterSpacing: 8, textAlign: 'center', paddingVertical: S.sm },
  member: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  pos: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
});
