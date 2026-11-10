import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api, type GroupSummary } from '@/lib/api';
import { dateFr, dueLabel, FREQ, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, H1, H2, Muted, Pill, Progress, Screen, T } from '@/ui';
import { C, S } from '@/theme';

export default function Home() {
  const { user } = useSession();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(await api<GroupSummary[]>('/groups'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const dues = (groups ?? []).filter((g) => g.currentCycle && !g.currentCycle.iAmBeneficiary && !g.currentCycle.iHavePaid);
  const myTurn = (groups ?? []).filter((g) => g.currentCycle?.iAmBeneficiary);
  const first = user?.name?.split(' ')[0];

  return (
    <Screen
      edges={['top', 'bottom']}
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
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Muted>Mbote{first ? ` ${first}` : ''} 👋</Muted>
          <H1>Mes tontines</H1>
        </View>
        <Pressable accessibilityLabel="Mon profil" onPress={() => router.push('/profile')} style={s.avatar}>
          <Text style={{ color: C.gold, fontWeight: '800', fontSize: 18 }}>{(first?.[0] ?? '?').toUpperCase()}</Text>
        </Pressable>
      </View>

      <ErrorBox message={error} />

      {dues.length > 0 && (
        <Card style={{ borderColor: C.gold, backgroundColor: C.goldDim }}>
          <T style={{ fontWeight: '700' }}>💸 {dues.length === 1 ? '1 cotisation à payer' : `${dues.length} cotisations à payer`}</T>
          {dues.map((g) => (
            <Pressable key={g.id} onPress={() => router.push({ pathname: '/pay/[id]', params: { id: String(g.id) } })} style={s.dueRow}>
              <View style={{ flex: 1 }}>
                <T>{g.name}</T>
                <Muted style={{ fontSize: 13 }}>
                  {dateFr(g.currentCycle!.dueDate)} · {dueLabel(g.currentCycle!.dueDate)}
                </Muted>
              </View>
              <Text style={{ color: C.gold, fontWeight: '800', fontSize: 16 }}>{money(g.amount, g.currency)} ›</Text>
            </Pressable>
          ))}
        </Card>
      )}

      {myTurn.map((g) => (
        <Card key={`turn-${g.id}`} style={{ borderColor: C.green, backgroundColor: C.greenDim }} onPress={() => router.push({ pathname: '/group/[id]', params: { id: String(g.id) } })}>
          <T style={{ fontWeight: '700' }}>🎁 C’est ton tour dans « {g.name} »</T>
          <Muted>
            {g.currentCycle!.paidCount}/{g.currentCycle!.expectedCount} membres ont cotisé · cagnotte {money(g.pot, g.currency)}
          </Muted>
        </Card>
      ))}

      <View style={{ flexDirection: 'row', gap: S.sm }}>
        <Button title="+ Créer" onPress={() => router.push('/create')} style={{ flex: 1 }} />
        <Button title="Rejoindre" variant="secondary" onPress={() => router.push('/join')} style={{ flex: 1 }} />
      </View>

      {groups && groups.length === 0 && (
        <Card style={{ alignItems: 'center', paddingVertical: S.xl }}>
          <Text style={{ fontSize: 40 }}>🤝</Text>
          <H2>Aucune tontine pour l’instant</H2>
          <Muted style={{ textAlign: 'center' }}>Crée ta première likelemba et invite tes proches avec un simple code, ou rejoins celle d’un ami.</Muted>
        </Card>
      )}

      {(groups ?? []).map((g) => (
        <Card key={g.id} onPress={() => router.push({ pathname: '/group/[id]', params: { id: String(g.id) } })}>
          <View style={s.cardHead}>
            <H2 style={{ flex: 1 }} numberOfLines={1}>
              {g.name}
            </H2>
            <StatusPill g={g} />
          </View>
          <Muted>
            {money(g.amount, g.currency)} · {FREQ[g.frequency]} · {g.members}/{g.maxMembers} membres
          </Muted>
          {g.currentCycle ? (
            <>
              <Progress value={g.currentCycle.paidCount} total={g.currentCycle.expectedCount} />
              <Muted style={{ fontSize: 13 }}>
                Tour {g.currentCycle.number} · {g.currentCycle.paidCount}/{g.currentCycle.expectedCount} ont payé · échéance {dueLabel(g.currentCycle.dueDate)}
              </Muted>
            </>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

function StatusPill({ g }: { g: GroupSummary }) {
  if (g.status === 'forming') return <Pill text="En formation" />;
  if (g.status === 'completed') return <Pill text="Terminée" tone="green" />;
  const c = g.currentCycle;
  if (!c) return <Pill text="Active" tone="green" />;
  if (c.iAmBeneficiary) return <Pill text="Ton tour" tone="green" />;
  if (c.iHavePaid) return <Pill text="Payé ✓" tone="green" />;
  return <Pill text="À payer" tone="gold" />;
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: S.md, marginTop: S.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  dueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#5a4a20' },
});
