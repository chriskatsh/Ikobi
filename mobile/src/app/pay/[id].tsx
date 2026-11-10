import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { api, ApiError, type Contribution, type GroupDetail, type Quote } from '@/lib/api';
import { detectOperator, money, pct } from '@/lib/format';
import { useSession } from '@/lib/session';
import { OPERATOR_INFO, OperatorBadge } from '@/operators';
import { ActionBar, Button, Card, ErrorBox, ErrorState, KV, Muted, PhoneInput, Screen, SkeletonCard } from '@/ui';
import { C, F, R, S } from '@/theme';

type Phase = 'form' | 'waiting' | 'success' | 'failed';

export default function Pay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const [g, setG] = useState<GroupDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phone, setPhone] = useState(user?.phone ? user.phone.slice(3) : '');
  const [method, setMethod] = useState<string | null>(detectOperator(user?.phone ?? ''));
  const [quoteState, setQuote] = useState<(Quote & { forMethod: string }) | null>(null);
  const quote = quoteState && quoteState.forMethod === method ? quoteState : null;
  const [phase, setPhase] = useState<Phase>('form');
  const [contribution, setContribution] = useState<Contribution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [waitStart, setWaitStart] = useState(0);
  const [now, setNow] = useState(0);

  // Chargement ; si un paiement est déjà en cours, on reprend son suivi au lieu d'en créer un second.
  const fetchGroup = (groupId: string) =>
    api<GroupDetail>(`/groups/${groupId}`).then(async (d) => {
      const pendingId = d.currentCycle?.myPendingContributionId;
      const pending = pendingId ? await api<Contribution>(`/contributions/${pendingId}`) : null;
      return { d, pending: pending?.status === 'pending' ? pending : null };
    });
  const apply = ({ d, pending }: { d: GroupDetail; pending: Contribution | null }) => {
    setG(d);
    if (pending) {
      setContribution(pending);
      setWaitStart(Date.now());
      setPhase('waiting');
    }
  };
  const load = () => {
    setLoadError(null);
    fetchGroup(id).then(apply).catch((e) => setLoadError((e as Error).message));
  };

  useEffect(() => {
    let alive = true;
    fetchGroup(id)
      .then((r) => alive && apply(r))
      .catch((e) => alive && setLoadError((e as Error).message));
    return () => {
      alive = false;
    };
     
  }, [id]);

  // Devis : cotisation + frais = total, affiché AVANT la confirmation.
  useEffect(() => {
    if (!method) return;
    let alive = true;
    api<Quote>(`/groups/${id}/contributions/quote?method=${method}`)
      .then((q) => alive && setQuote({ ...q, forMethod: method }))
      .catch(() => alive && setQuote(null));
    return () => {
      alive = false;
    };
  }, [id, method]);

  // Suivi du paiement en attente
  useEffect(() => {
    if (phase !== 'waiting' || !contribution) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      try {
        const c = await api<Contribution>(`/contributions/${contribution.id}`);
        if (c.status !== 'pending') {
          setContribution(c);
          setPhase(c.status === 'success' ? 'success' : 'failed');
          void Haptics.notificationAsync(c.status === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
          AccessibilityInfo.announceForAccessibility(c.status === 'success' ? 'Cotisation reçue' : 'Paiement non abouti');
        }
      } catch {
        // réseau instable : nouvel essai au prochain passage
      }
    }, 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [phase, contribution]);

  if (!g) {
    return <Screen>{loadError ? <ErrorState message={loadError} onRetry={load} /> : <><SkeletonCard /><SkeletonCard /></>}</Screen>;
  }

  async function submit() {
    setError(null);
    if (phone.length !== 9) return setError('Numéro Mobile Money incomplet.');
    if (!method) return setError('Choisissez votre opérateur.');
    setLoading(true);
    try {
      const c = await api<Contribution>(`/groups/${id}/contributions`, { body: { phone: '243' + phone, method } });
      setContribution(c);
      setWaitStart(Date.now());
      setPhase(c.status === 'success' ? 'success' : c.status === 'failed' ? 'failed' : 'waiting');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  const op = contribution ? OPERATOR_INFO[contribution.method] : method ? OPERATOR_INFO[method] : null;

  // --- En attente de validation sur le téléphone
  if (phase === 'waiting') {
    const showHelp = now - waitStart >= 45000;
    return (
      <Screen footer={<ActionBar><Button title="Fermer, je serai notifié" variant="secondary" onPress={() => router.back()} /></ActionBar>}>
        <Stack.Screen options={{ title: 'Paiement en cours', headerBackVisible: false }} />
        <View style={s.center}>
          <Pulse />
          <Text style={s.bigTitle} accessibilityRole="header">Validez sur votre téléphone</Text>
          <Muted style={{ textAlign: 'center' }}>
            Une demande de {money(contribution?.total ?? g.amount, g.currency)} a été envoyée sur votre {op?.label ?? 'Mobile Money'}. Saisissez votre code PIN dans la fenêtre de l’opérateur.
          </Muted>
        </View>
        <Card style={{ gap: 0 }}>
          <Step done label="Demande envoyée à l’opérateur" />
          <Step active label="Validation avec votre code PIN" />
          <Step label="Confirmation du paiement" last />
        </Card>
        {showHelp ? (
          <Card style={{ gap: S.sm }}>
            <Text style={s.cardTitle}>Rien reçu ?</Text>
            <Muted style={{ fontSize: 14 }}>• Vérifiez que le téléphone {op?.label ? `${op.label} ` : ''}est allumé et a du réseau.</Muted>
            <Muted style={{ fontSize: 14 }}>• Vérifiez que votre solde couvre le montant et les frais.</Muted>
            <Muted style={{ fontSize: 14 }}>• Si la fenêtre a disparu, attendez 3 minutes puis relancez le paiement : vous ne serez jamais débité deux fois pour ce tour.</Muted>
          </Card>
        ) : null}
        <View style={s.pin}>
          <Ionicons name="shield-checkmark-outline" size={18} color={C.green} />
          <Text style={s.pinText}>iKobi ne vous demandera jamais votre code PIN, ni par message, ni par téléphone.</Text>
        </View>
      </Screen>
    );
  }

  // --- Reçu
  if (phase === 'success' && contribution) {
    const receipt = `Reçu iKobi\n${g.name} · tour ${g.currentCycle?.number ?? ''}\nCotisation : ${money(contribution.amount, g.currency)}\nFrais de paiement : ${money(contribution.processingFee, g.currency)}${contribution.serviceFee > 0 ? `\nFrais de service iKobi : ${money(contribution.serviceFee, g.currency)}` : ''}\nTotal payé : ${money(contribution.total, g.currency)}\nOpérateur : ${op?.label ?? contribution.method}\nRéférence : ${contribution.reference}`;
    return (
      <Screen footer={<ActionBar><Button title="Terminé" onPress={() => router.back()} /><Button title="Partager le reçu" variant="secondary" onPress={() => Share.share({ message: receipt })} /></ActionBar>}>
        <Stack.Screen options={{ title: '', headerBackVisible: false }} />
        <View style={s.center}>
          <Check />
          <Text style={s.bigTitle} accessibilityRole="header">Cotisation reçue</Text>
          <Muted style={{ textAlign: 'center' }}>Merci ! Le groupe voit votre paiement.</Muted>
        </View>
        <Card style={{ gap: 2 }}>
          <KV label="Tontine" value={g.name} />
          <KV label="Cotisation" value={money(contribution.amount, g.currency)} />
          <KV label="Frais de paiement" value={money(contribution.processingFee, g.currency)} />
          {contribution.serviceFee > 0 ? <KV label="Frais de service iKobi" value={money(contribution.serviceFee, g.currency)} /> : null}
          <View style={s.sep} />
          <KV label="Total payé" value={money(contribution.total, g.currency)} strong />
          <View style={s.sep} />
          <KV label="Opérateur" value={op?.label ?? contribution.method} />
          <KV label="Référence" value={contribution.reference} />
        </Card>
      </Screen>
    );
  }

  // --- Échec
  if (phase === 'failed') {
    return (
      <Screen footer={<ActionBar><Button title="Réessayer" onPress={() => setPhase('form')} /><Button title="Fermer" variant="ghost" onPress={() => router.back()} /></ActionBar>}>
        <Stack.Screen options={{ title: '' }} />
        <View style={s.center}>
          <View style={[s.circle, { backgroundColor: C.redDim }]}>
            <Ionicons name="close" size={44} color={C.red} />
          </View>
          <Text style={s.bigTitle} accessibilityRole="header">Paiement non abouti</Text>
          <Muted style={{ textAlign: 'center' }}>{contribution?.failureReason || 'Le paiement a été refusé ou annulé.'} Rien n’a été débité.</Muted>
        </View>
      </Screen>
    );
  }

  // --- Formulaire
  const c = g.currentCycle;
  return (
    <Screen
      footer={
        <ActionBar note={quote && quote.fee > 0 ? `Dont ${money(quote.fee, g.currency)} de frais de paiement` : undefined}>
          <Button title={quote ? `Payer ${money(quote.total, g.currency)}` : 'Payer'} onPress={submit} loading={loading} disabled={!quote || phone.length !== 9} />
        </ActionBar>
      }>
      <Stack.Screen options={{ title: 'Cotiser' }} />
      <View style={s.amountHead}>
        <Muted>{g.name}{c ? ` · tour ${c.number}` : ''}</Muted>
        <Text style={s.amount}>{money(g.amount, g.currency)}</Text>
      </View>

      <Text style={s.cardTitle}>Payer avec</Text>
      <View style={s.ops}>
        {Object.entries(OPERATOR_INFO).map(([k, o]) => {
          const on = method === k;
          return (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.label} onPress={() => setMethod(k)} style={[s.op, on && s.opOn]}>
              <OperatorBadge id={k} size={40} />
              <Text style={s.opLabel} numberOfLines={1}>{o.label}</Text>
              {on ? <Ionicons name="checkmark-circle" size={20} color={C.gold} style={s.opCheck} /> : null}
            </Pressable>
          );
        })}
      </View>

      <PhoneInput
        label="Numéro Mobile Money"
        value={phone}
        onChange={(d) => {
          setPhone(d);
          const det = d.length >= 2 ? detectOperator('243' + d.padEnd(9, '0')) : null;
          if (det) setMethod(det);
        }}
      />

      <Card style={{ gap: 2 }}>
        <KV label="Cotisation" value={money(quote?.principal ?? g.amount, g.currency)} />
        <KV label={quote ? `Frais de paiement (${pct(quote.rates.processing)})` : 'Frais de paiement'} value={quote ? money(quote.processingFee, g.currency) : '…'} />
        {quote && quote.serviceFee > 0 ? <KV label={`Frais de service iKobi (${pct(quote.rates.service)})`} value={money(quote.serviceFee, g.currency)} /> : null}
        <View style={s.sep} />
        <KV label="Total à payer" value={quote ? money(quote.total, g.currency) : '…'} strong />
        <Muted style={{ fontSize: 12, marginTop: 6 }}>Votre cotisation est comptée dès que l’opérateur confirme. Un paiement refusé ou annulé n’est pas débité.</Muted>
      </Card>
      <ErrorBox message={error} />
      <Muted style={{ textAlign: 'center', fontSize: 12 }}>Paiement traité par AWA Network.</Muted>
    </Screen>
  );
}

function Step({ label, done, active, last }: { label: string; done?: boolean; active?: boolean; last?: boolean }) {
  return (
    <View style={s.step}>
      <View style={{ alignItems: 'center' }}>
        <View style={[s.stepDot, done && { backgroundColor: C.green, borderColor: C.green }, active && { borderColor: C.gold }]}>
          {done ? <Ionicons name="checkmark" size={13} color="#04140F" /> : active ? <View style={s.stepInner} /> : null}
        </View>
        {!last ? <View style={[s.stepLine, done && { backgroundColor: C.green }]} /> : null}
      </View>
      <Text style={[s.stepLabel, (done || active) && { color: C.text }]}>{label}</Text>
    </View>
  );
}

function Pulse() {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
      loop.start();
    });
    return () => loop?.stop();
  }, [v]);
  return (
    <View style={s.pulseWrap}>
      <Animated.View style={[s.pulseRing, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }] }]} />
      <View style={[s.circle, { backgroundColor: C.goldDim }]}>
        <Ionicons name="phone-portrait-outline" size={36} color={C.gold} />
      </View>
    </View>
  );
}

function Check() {
  const [v] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View style={[s.circle, { backgroundColor: C.greenDim, transform: [{ scale: v }] }]}>
      <Ionicons name="checkmark" size={46} color={C.green} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', gap: S.sm, paddingTop: S.lg, paddingBottom: S.sm },
  bigTitle: { color: C.text, fontFamily: F.displayX, fontSize: 28, letterSpacing: -0.6, textAlign: 'center', marginTop: S.sm },
  cardTitle: { color: C.text, fontFamily: F.display, fontSize: 18 },
  circle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  pulseWrap: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: C.gold },
  amountHead: { alignItems: 'center', gap: 2, paddingVertical: S.md },
  amount: { color: C.text, fontFamily: F.displayX, fontSize: 48, letterSpacing: -1.6 },
  ops: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  op: { width: '48.5%', backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1.5, borderColor: C.border, padding: S.md, gap: S.sm, minHeight: 104 },
  opOn: { borderColor: C.gold, backgroundColor: C.goldDim },
  opLabel: { color: C.text, fontFamily: F.bodyS, fontSize: 15 },
  opCheck: { position: 'absolute', top: 10, right: 10 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: S.sm },
  step: { flexDirection: 'row', gap: S.md },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  stepInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.gold },
  stepLine: { width: 2, flex: 1, minHeight: 18, backgroundColor: C.border, marginVertical: 2 },
  stepLabel: { color: C.muted, fontFamily: F.bodyM, fontSize: 15, paddingTop: 2, paddingBottom: S.md },
  pin: { flexDirection: 'row', gap: S.sm, alignItems: 'center', paddingHorizontal: S.xs },
  pinText: { flex: 1, color: C.muted, fontFamily: F.body, fontSize: 13, lineHeight: 18 },
});
