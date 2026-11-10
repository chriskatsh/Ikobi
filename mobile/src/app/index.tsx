import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api, type GroupSummary } from '@/lib/api';
import { dateFr, dueLabel, daysUntil, FREQ, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Avatar, Button, Card, EmptyState, ErrorState, Pill, Progress, Screen, SkeletonCard } from '@/ui';
import { C, F, R, S } from '@/theme';

type NextAction =
  | { kind: 'pay'; group: GroupSummary }
  | { kind: 'receive'; group: GroupSummary }
  | { kind: 'start'; group: GroupSummary }
  | { kind: 'none' };

function nextAction(groups: GroupSummary[]): NextAction {
  const dues = groups
    .filter((g) => g.currentCycle && !g.currentCycle.iAmBeneficiary && !g.currentCycle.iHavePaid)
    .sort((a, b) => a.currentCycle!.dueDate.localeCompare(b.currentCycle!.dueDate));
  if (dues[0]) return { kind: 'pay', group: dues[0] };
  const turn = groups.find((g) => g.currentCycle?.iAmBeneficiary);
  if (turn) return { kind: 'receive', group: turn };
  const toStart = groups.find((g) => g.status === 'forming' && g.role === 'admin' && g.members >= 2);
  if (toStart) return { kind: 'start', group: toStart };
  return { kind: 'none' };
}

export default function Home() {
  const { user } = useSession();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !user.name) router.replace('/name');
  }, [user]);

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

  const first = user?.name?.split(' ')[0];
  const action = groups ? nextAction(groups) : null;
  const open = (id: number) => router.push({ pathname: '/group/[id]', params: { id: String(id) } });

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
          <Text style={s.hello}>Mbote{first ? ` ${first}` : ''}</Text>
          <Text style={s.title} accessibilityRole="header">Mes tontines</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Mon profil" onPress={() => router.push('/profile')} hitSlop={8}>
          <Avatar name={user?.name || '?'} id={user?.id ?? 0} size={46} />
        </Pressable>
      </View>

      {error && !groups ? <ErrorState message={error} onRetry={load} /> : null}

      {!groups && !error ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : null}

      {action ? <Hero action={action} onOpen={open} /> : null}

      {groups && groups.length > 0 ? (
        <>
          <View style={s.rowHead}>
            <Text style={s.section}>Toutes mes tontines</Text>
            <View style={{ flexDirection: 'row', gap: S.md }}>
              <Pressable accessibilityRole="button" onPress={() => router.push('/join')} hitSlop={8}>
                <Text style={s.link}>Rejoindre</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push('/create')} hitSlop={8}>
                <Text style={s.link}>Créer</Text>
              </Pressable>
            </View>
          </View>
          {groups.map((g) => (
            <GroupRow key={g.id} g={g} onPress={() => open(g.id)} />
          ))}
        </>
      ) : null}

      {groups && groups.length === 0 ? (
        <Card>
          <EmptyState
            icon="🤝"
            title="Lancez votre première likelemba"
            text="Créez une tontine et invitez vos proches avec un code, ou rejoignez celle d’un proche."
            action={
              <View style={{ width: '100%', gap: S.sm, marginTop: S.sm }}>
                <Button title="Créer une tontine" onPress={() => router.push('/create')} />
                <Button title="J’ai un code d’invitation" variant="secondary" onPress={() => router.push('/join')} />
              </View>
            }
          />
        </Card>
      ) : null}
    </Screen>
  );
}

function Hero({ action, onOpen }: { action: NextAction; onOpen: (id: number) => void }) {
  if (action.kind === 'none') {
    return (
      <View style={[s.hero, s.heroCalm]}>
        <Ionicons name="checkmark-circle" size={28} color={C.green} />
        <Text style={s.heroTitle}>Vous êtes à jour</Text>
        <Text style={s.heroText}>Aucune cotisation à payer pour le moment. Nous vous prévenons avant chaque échéance.</Text>
      </View>
    );
  }
  const g = action.group;
  const c = g.currentCycle;
  if (action.kind === 'pay' && c) {
    const late = daysUntil(c.dueDate) < 0;
    return (
      <LinearGradient colors={late ? ['#3A1E22', '#1A1420'] : ['#12403A', '#0F1A2B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        <Text style={s.heroKicker}>{late ? 'Cotisation en retard' : 'Prochaine cotisation'}</Text>
        <Text style={s.heroAmount} accessibilityLabel={`${money(g.amount, g.currency)} pour ${g.name}`}>{money(g.amount, g.currency)}</Text>
        <Text style={s.heroText}>
          {g.name} · tour {c.number} · {dateFr(c.dueDate)} ({dueLabel(c.dueDate)})
        </Text>
        <Button title="Cotiser maintenant" onPress={() => router.push({ pathname: '/pay/[id]', params: { id: String(g.id) } })} style={{ marginTop: S.sm }} />
      </LinearGradient>
    );
  }
  if (action.kind === 'receive' && c) {
    return (
      <Pressable accessibilityRole="button" onPress={() => onOpen(g.id)}>
        <LinearGradient colors={['#3D3115', '#151A2A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <Text style={[s.heroKicker, { color: C.pot }]}>C’est votre tour</Text>
          <Text style={s.heroAmount}>{money(g.pot, g.currency)}</Text>
          <Text style={s.heroText}>
            {g.name} · {c.paidCount}/{c.expectedCount} membres ont cotisé
          </Text>
          <Progress value={c.paidCount} total={c.expectedCount} />
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <View style={s.hero}>
      <Text style={s.heroKicker}>Prête à démarrer</Text>
      <Text style={s.heroTitle}>{g.name}</Text>
      <Text style={s.heroText}>
        {g.members} membres ont rejoint. Démarrez quand le groupe est au complet.
      </Text>
      <Button title="Ouvrir la tontine" variant="secondary" onPress={() => onOpen(g.id)} style={{ marginTop: S.sm }} />
    </View>
  );
}

function GroupRow({ g, onPress }: { g: GroupSummary; onPress: () => void }) {
  const c = g.currentCycle;
  const pill =
    g.status === 'forming' ? <Pill text={`${g.members}/${g.maxMembers} membres`} /> :
    g.status === 'completed' ? <Pill text="Terminée" tone="green" /> :
    c?.iAmBeneficiary ? <Pill text="Votre tour" tone="gold" /> :
    c?.iHavePaid ? <Pill text="Payé" tone="green" /> :
    c ? <Pill text="À payer" tone={daysUntil(c.dueDate) < 0 ? 'red' : 'gold'} /> : null;
  return (
    <Card onPress={onPress} style={{ gap: S.md }}>
      <View style={s.cardHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{g.name}</Text>
          <Text style={s.cardMeta}>
            {money(g.amount, g.currency)} · {FREQ[g.frequency].toLowerCase()}
          </Text>
        </View>
        {pill}
      </View>
      {c ? (
        <View style={{ gap: 8 }}>
          <Progress value={c.paidCount} total={c.expectedCount} />
          <View style={s.cardFoot}>
            <Text style={s.cardMeta}>Tour {c.number} · {c.paidCount}/{c.expectedCount} payés</Text>
            <Text style={s.cardMeta}>{dueLabel(c.dueDate)}</Text>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: S.md, marginTop: S.sm, marginBottom: S.xs },
  hello: { color: C.muted, fontFamily: F.bodyM, fontSize: 15 },
  title: { color: C.text, fontFamily: F.displayX, fontSize: 32, letterSpacing: -1 },
  hero: { borderRadius: R.lg, padding: S.lg, gap: 6, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, overflow: 'hidden' },
  heroCalm: { alignItems: 'flex-start', gap: S.sm },
  heroKicker: { color: C.green, fontFamily: F.bodyB, fontSize: 14 },
  heroAmount: { color: C.text, fontFamily: F.displayX, fontSize: 44, letterSpacing: -1.5, lineHeight: 50 },
  heroTitle: { color: C.text, fontFamily: F.display, fontSize: 22 },
  heroText: { color: '#C3CADB', fontFamily: F.body, fontSize: 15, lineHeight: 21 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: S.sm },
  section: { color: C.text, fontFamily: F.display, fontSize: 18 },
  link: { color: C.gold, fontFamily: F.bodyB, fontSize: 15 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  cardTitle: { color: C.text, fontFamily: F.display, fontSize: 18, letterSpacing: -0.3 },
  cardMeta: { color: C.muted, fontFamily: F.body, fontSize: 14 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between' },
});
