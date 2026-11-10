import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import { api, ApiError, type GroupDetail } from '@/lib/api';
import { dateFr, daysUntil, dueLabel, FREQ, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { ActionBar, Avatar, Button, Card, ErrorBox, ErrorState, KV, Muted, Pill, Progress, Screen, Segmented, SkeletonCard, useToast } from '@/ui';
import { C, F, R, S } from '@/theme';

const WA_BOT = process.env.EXPO_PUBLIC_WHATSAPP_NUMBER || '';
type Tab = 'tour' | 'membres' | 'calendrier' | 'regles';

export default function Group() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { user } = useSession();
  const toast = useToast();
  const [g, setG] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('tour');

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

  if (!g) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        {error ? <ErrorState message={error} onRetry={load} /> : <><SkeletonCard /><SkeletonCard /></>}
      </Screen>
    );
  }

  const c = g.currentCycle;
  const isAdmin = g.myRole === 'admin';
  const beneficiary = c ? g.members.find((m) => m.id === c.beneficiaryId) : null;
  const req = c?.payoutRequest;
  const canRequest = isAdmin && c?.status === 'ready' && (!req || req.status === 'rejected' || req.status === 'failed');
  const mustPay = c?.status === 'open' && !c.iAmBeneficiary && !c.iHavePaid;
  const late = c ? daysUntil(c.dueDate) < 0 : false;

  async function share() {
    await Share.share({
      message:
        `Rejoignez ma tontine « ${g!.name} » sur iKobi.\n` +
        `${money(g!.amount, g!.currency)} ${FREQ[g!.frequency].toLowerCase()}.\n\n` +
        `Code d’invitation : ${g!.inviteCode}` +
        (WA_BOT ? `\nOu sur WhatsApp : https://wa.me/${WA_BOT}?text=${encodeURIComponent('rejoindre ' + g!.inviteCode)}` : ''),
    });
  }

  async function copy() {
    await Clipboard.setStringAsync(g!.inviteCode);
    toast.show('Code copié');
  }

  function start() {
    Alert.alert('Démarrer la tontine ?', `${g!.members.length} membres, donc ${g!.members.length} tours. Personne ne pourra plus rejoindre ensuite.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Ordre d’arrivée', onPress: () => doStart('join') },
      { text: 'Tirage au sort', onPress: () => doStart('random') },
    ]);
  }

  async function doStart(order: 'join' | 'random') {
    setBusy('start');
    try {
      setG(await api<GroupDetail>(`/groups/${id}/start`, { body: { order } }));
      toast.show('La tontine a démarré');
    } catch (e) {
      Alert.alert('Démarrage impossible', e instanceof ApiError ? e.message : 'Erreur');
    } finally {
      setBusy(null);
    }
  }

  function requestPayout() {
    Alert.alert(
      'Demander le versement ?',
      `${money(g!.pot, g!.currency)} pour ${beneficiary?.name ?? 'le bénéficiaire'}. L’équipe iKobi vérifie que les fonds sont réglés avant l’envoi.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Demander',
          onPress: async () => {
            setBusy('payout');
            try {
              await api(`/groups/${id}/cycles/${c!.number}/payout-request`, { method: 'POST' });
              await load();
              toast.show('Demande envoyée');
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

  // Action principale, toujours visible en bas d'écran
  let footer: React.ReactNode = undefined;
  if (mustPay) {
    footer = (
      <ActionBar note={WA_BOT ? undefined : `Échéance ${dueLabel(c!.dueDate)}`}>
        <Button title={`Cotiser ${money(g.amount, g.currency)}`} onPress={() => router.push({ pathname: '/pay/[id]', params: { id: String(g.id) } })} />
        {WA_BOT ? <Button title="Cotiser sur WhatsApp" variant="whatsapp" onPress={() => Linking.openURL(`https://wa.me/${WA_BOT}?text=cotiser`)} /> : null}
      </ActionBar>
    );
  } else if (canRequest) {
    footer = <ActionBar><Button title={`Demander le versement · ${money(g.pot, g.currency)}`} onPress={requestPayout} loading={busy === 'payout'} /></ActionBar>;
  } else if (g.status === 'forming') {
    footer = (
      <ActionBar note={isAdmin && g.members.length < 2 ? 'Il faut au moins 2 membres pour démarrer.' : undefined}>
        {isAdmin ? <Button title={`Démarrer avec ${g.members.length} membre${g.members.length > 1 ? 's' : ''}`} onPress={start} loading={busy === 'start'} disabled={g.members.length < 2} /> : null}
        <Button title="Inviter des membres" variant={isAdmin ? 'secondary' : 'primary'} onPress={share} />
      </ActionBar>
    );
  }

  return (
    <Screen
      footer={footer}
      refreshControl={<RefreshControl tintColor={C.gold} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () =>
            g.status !== 'forming' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Historique des paiements" hitSlop={10} onPress={() => router.push({ pathname: '/history/[id]', params: { id: String(g.id) } })}>
                <Ionicons name="receipt-outline" size={22} color={C.text} />
              </Pressable>
            ) : null,
        }}
      />

      <View style={{ gap: 6 }}>
        <Text style={s.name} accessibilityRole="header">{g.name}</Text>
        <Text style={s.meta}>
          {money(g.amount, g.currency)} · {FREQ[g.frequency].toLowerCase()} · {g.members.length}/{g.maxMembers} membres
        </Text>
      </View>

      {/* Cagnotte */}
      <LinearGradient
        colors={c?.iAmBeneficiary ? ['#3D3115', '#151A2A'] : ['#12403A', '#0F1A2B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.pot}>
        {g.status === 'forming' ? (
          <>
            <Text style={s.potKicker}>Cagnotte prévue à chaque tour</Text>
            <Text style={s.potAmount}>{money(g.amount * (g.maxMembers - 1), g.currency)}</Text>
            <Text style={s.potText}>Avec {g.maxMembers} membres. {g.members.length} ont rejoint.</Text>
            <Progress value={g.members.length} total={g.maxMembers} />
          </>
        ) : g.status === 'completed' ? (
          <>
            <Text style={s.potKicker}>Tontine terminée</Text>
            <Text style={s.potAmount}>{g.totalCycles} tours</Text>
            <Text style={s.potText}>Chaque membre a reçu sa cagnotte. Bravo au groupe.</Text>
          </>
        ) : c ? (
          <>
            <Text style={[s.potKicker, c.iAmBeneficiary && { color: C.pot }]}>
              {c.iAmBeneficiary ? 'Cette cagnotte est pour vous' : `Tour ${c.number} sur ${g.totalCycles} · pour ${beneficiary?.name ?? '—'}`}
            </Text>
            <Text style={s.potAmount}>{money(g.pot, g.currency)}</Text>
            <Progress value={c.paidCount} total={c.expectedCount} />
            <View style={s.potFoot}>
              <Text style={s.potText}>{c.paidCount}/{c.expectedCount} ont cotisé</Text>
              <Text style={[s.potText, late && { color: C.red }]}>{c.status === 'open' ? dueLabel(c.dueDate) : c.status === 'ready' ? 'Tour complet' : 'Versement en cours'}</Text>
            </View>
          </>
        ) : null}
      </LinearGradient>

      {g.status === 'forming' ? (
        <Card style={{ alignItems: 'center', gap: S.sm }}>
          <Text style={s.cardTitle}>{created ? 'Tontine créée ! Invitez les membres' : 'Code d’invitation'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Code ${g.inviteCode.split('').join(' ')}, copier`} onPress={copy} style={s.codeBox}>
            <Text style={s.code} selectable>{g.inviteCode}</Text>
            <Ionicons name="copy-outline" size={20} color={C.muted} />
          </Pressable>
          <Muted style={{ textAlign: 'center', fontSize: 14 }}>
            Les membres saisissent ce code dans l’app, ou écrivent « rejoindre {g.inviteCode} » à l’assistant WhatsApp.
          </Muted>
        </Card>
      ) : null}

      {g.status !== 'forming' ? (
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'tour', label: 'Tour' },
            { value: 'membres', label: 'Membres' },
            { value: 'calendrier', label: 'Calendrier' },
            { value: 'regles', label: 'Règles' },
          ]}
        />
      ) : null}

      {(g.status === 'forming' || tab === 'membres') && <Members g={g} meId={user?.id} />}

      {g.status !== 'forming' && tab === 'tour' && c ? (
        <>
          <Card style={{ gap: 2 }}>
            <Text style={s.cardTitle}>Où en est l’argent</Text>
            <View style={s.grid}>
              <Amount label="Prévu" value={money(c.scheduled, g.currency)} />
              <Amount label="Collecté" value={money(c.collected, g.currency)} />
              <Amount label="Réglé" value={money(c.settled, g.currency)} />
              <Amount label="Versé" value={money(c.paid, g.currency)} />
            </View>
            {c.pendingPayments > 0 ? <Muted style={{ fontSize: 13 }}>{c.pendingPayments} paiement(s) en attente de confirmation de l’opérateur.</Muted> : null}
            {req?.status === 'requested' ? <Status icon="time-outline" tone="gold" text="Versement demandé : en cours de vérification par iKobi." /> : null}
            {c.status === 'paying_out' ? <Status icon="paper-plane-outline" tone="gold" text="Versement en cours d’envoi vers le Mobile Money du bénéficiaire." /> : null}
            {req?.status === 'rejected' ? <Status icon="close-circle-outline" tone="red" text={`Versement refusé${req.note ? ` : ${req.note}` : ''}.`} /> : null}
            {req?.status === 'failed' ? <Status icon="alert-circle-outline" tone="red" text="Le dernier envoi a échoué chez l’opérateur. Une nouvelle demande est possible." /> : null}
            {c.status === 'ready' && !isAdmin && !req ? <Status icon="checkmark-circle-outline" tone="green" text="Tout est collecté : l’organisateur va demander le versement." /> : null}
            {c.iHavePaid ? <Status icon="checkmark-circle" tone="green" text="Vous avez payé ce tour." /> : null}
          </Card>
          <Card style={{ gap: 2 }}>
            <Text style={s.cardTitle}>Ma participation</Text>
            <KV label="Total cotisé" value={money(g.me.totalPaid, g.currency)} />
            <KV label="Mon tour de recevoir" value={g.me.position ? `Tour ${g.me.position} sur ${g.totalCycles}` : '—'} />
            <KV label="Date prévue" value={g.me.expectedPayoutDate ? dateFr(g.me.expectedPayoutDate) : '—'} />
            {g.me.payoutReceived !== null ? <KV label="Cagnotte reçue" value={money(g.me.payoutReceived, g.currency)} tone="green" /> : null}
            <Muted style={{ fontSize: 12, marginTop: 6 }}>La date de versement dépend de la collecte complète des cotisations du tour.</Muted>
          </Card>
        </>
      ) : null}

      {g.status !== 'forming' && tab === 'calendrier' ? (
        <Card style={{ gap: 0 }}>
          {g.cycles.map((cy, i) => {
            const who = g.members.find((m) => m.id === cy.beneficiaryId);
            const current = c?.number === cy.number;
            const done = cy.status === 'closed';
            return (
              <View key={cy.number} style={[s.tl, i > 0 && s.rowBorder]}>
                <View style={[s.tlDot, done && { backgroundColor: C.green, borderColor: C.green }, current && { borderColor: C.gold }]}>
                  {done ? <Ionicons name="checkmark" size={14} color="#04140F" /> : <Text style={[s.tlNum, current && { color: C.gold }]}>{cy.number}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowName, current && { color: C.gold }]}>{who?.id === user?.id ? 'Vous' : who?.name}</Text>
                  <Text style={s.rowMeta}>{dateFr(cy.dueDate)}{current ? ' · tour en cours' : ''}</Text>
                </View>
                {done ? <Pill text="Versé" tone="green" /> : null}
              </View>
            );
          })}
        </Card>
      ) : null}

      {g.status !== 'forming' && tab === 'regles' ? (
        <Card style={{ gap: S.sm }}>
          {[
            `${money(g.amount, g.currency)} par membre, ${FREQ[g.frequency].toLowerCase()}.`,
            `Le bénéficiaire du tour ne cotise pas ; il reçoit ${money(g.amount, g.currency)} × (membres − 1).`,
            'La cagnotte est envoyée quand toutes les cotisations du tour sont collectées et réglées, après vérification par iKobi.',
            'Les frais éventuels sont affichés avant chaque paiement.',
            'Un membre peut payer en retard ou ne pas payer : la tontine repose sur la confiance entre ses membres.',
          ].map((r) => (
            <View key={r} style={{ flexDirection: 'row', gap: S.sm }}>
              <Text style={{ color: C.gold, fontFamily: F.bodyB }}>•</Text>
              <Text style={{ flex: 1, color: C.text, fontFamily: F.body, fontSize: 15, lineHeight: 22 }}>{r}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <ErrorBox message={error} />
    </Screen>
  );
}

function Members({ g, meId }: { g: GroupDetail; meId?: number }) {
  return (
    <Card style={{ gap: 0 }}>
      {g.members.map((m, i) => (
        <View key={m.id} style={[s.row, i > 0 && s.rowBorder]}>
          <Avatar name={m.name} id={m.id} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowName}>{m.name}{m.id === meId ? ' (vous)' : ''}</Text>
            <Text style={s.rowMeta}>{m.role === 'admin' ? 'Organisateur · ' : ''}••• {m.phoneEnd}</Text>
          </View>
          {g.currentCycle ? (
            m.paidCurrent === null ? <Pill text="Reçoit" tone="gold" /> : m.paidCurrent ? <Pill text="Payé" tone="green" /> : <Pill text="En attente" />
          ) : null}
        </View>
      ))}
    </Card>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.amountCell}>
      <Text style={s.amountLabel}>{label}</Text>
      <Text style={s.amountValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function Status({ icon, text, tone }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone: 'green' | 'gold' | 'red' }) {
  const color = tone === 'green' ? C.green : tone === 'red' ? C.red : C.gold;
  return (
    <View style={s.status}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[s.statusText]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  name: { color: C.text, fontFamily: F.displayX, fontSize: 30, letterSpacing: -0.9, lineHeight: 34 },
  meta: { color: C.muted, fontFamily: F.body, fontSize: 15 },
  pot: { borderRadius: R.lg, padding: S.lg, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  potKicker: { color: C.green, fontFamily: F.bodyB, fontSize: 14 },
  potAmount: { color: C.text, fontFamily: F.displayX, fontSize: 44, letterSpacing: -1.5, lineHeight: 50 },
  potText: { color: '#C3CADB', fontFamily: F.bodyM, fontSize: 14 },
  potFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { color: C.text, fontFamily: F.display, fontSize: 18, marginBottom: 6 },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.surface2, borderRadius: R.md, paddingHorizontal: S.lg, paddingVertical: S.md },
  code: { color: C.text, fontFamily: F.displayX, fontSize: 34, letterSpacing: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: C.surface2, borderRadius: R.md, padding: S.sm },
  amountCell: { width: '50%', padding: S.sm, gap: 2 },
  amountLabel: { color: C.muted, fontFamily: F.bodyM, fontSize: 13 },
  amountValue: { color: C.text, fontFamily: F.display, fontSize: 18 },
  status: { flexDirection: 'row', gap: S.sm, alignItems: 'flex-start', marginTop: S.sm },
  statusText: { flex: 1, color: C.text, fontFamily: F.body, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  rowName: { color: C.text, fontFamily: F.bodyS, fontSize: 16 },
  rowMeta: { color: C.muted, fontFamily: F.body, fontSize: 13 },
  tl: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: 12 },
  tlDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  tlNum: { color: C.muted, fontFamily: F.bodyB, fontSize: 13 },
});
