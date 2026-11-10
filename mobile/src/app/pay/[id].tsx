import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { api, ApiError, type Contribution, type GroupDetail, type Quote } from '@/lib/api';
import { detectOperator, displayPhone, money, normalizePhone } from '@/lib/format';
import { useSession } from '@/lib/session';
import { AcceptedOperators, OPERATOR_INFO, OperatorBadge } from '@/operators';
import { Button, Card, Choice, ErrorBox, Field, H1, H2, Label, Loading, Muted, Screen } from '@/ui';
import { C, OPERATORS, S } from '@/theme';

type Phase = 'form' | 'waiting' | 'success' | 'failed';

export default function Pay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const [g, setG] = useState<GroupDetail | null>(null);
  const [phone, setPhone] = useState(user?.phone ? '0' + user.phone.slice(3) : '');
  const [method, setMethod] = useState<string | null>(detectOperator(user?.phone ?? ''));
  const [phase, setPhase] = useState<Phase>('form');
  const [contribution, setContribution] = useState<Contribution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api<GroupDetail>(`/groups/${id}`)
      .then((d) => {
        setG(d);
        // Un paiement est déjà en cours : on reprend le suivi.
        if (d.currentCycle?.myPendingContributionId) {
          void api<Contribution>(`/contributions/${d.currentCycle.myPendingContributionId}`).then((c) => {
            if (c.status === 'pending') {
              setContribution(c);
              setPhase('waiting');
            }
          });
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [id]);

  // Devis : principal + frais = total, affiché AVANT la confirmation.
  useEffect(() => {
    if (!method) return;
    let alive = true;
    api<Quote>(`/groups/${id}/contributions/quote?method=${method}`)
      .then((q) => alive && setQuote(q))
      .catch(() => alive && setQuote(null));
    return () => {
      alive = false;
    };
  }, [id, method]);

  useEffect(() => {
    if (phase !== 'waiting' || !contribution) return;
    let tries = 0;
    timer.current = setInterval(async () => {
      tries++;
      try {
        const c = await api<Contribution>(`/contributions/${contribution.id}`);
        if (c.status !== 'pending') {
          clearInterval(timer.current!);
          setContribution(c);
          setPhase(c.status === 'success' ? 'success' : 'failed');
          void Haptics.notificationAsync(c.status === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
        }
      } catch {
        // réseau instable : on réessaie au prochain passage
      }
      if (tries > 60) clearInterval(timer.current!); // ~5 min
    }, 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [phase, contribution]);

  if (!g) return error ? <Screen><ErrorBox message={error} /></Screen> : <Loading />;

  async function submit() {
    setError(null);
    if (!normalizePhone(phone)) return setError('Numéro Mobile Money invalide.');
    if (!method) return setError('Choisis ton opérateur.');
    setLoading(true);
    try {
      const c = await api<Contribution>(`/groups/${id}/contributions`, { body: { phone, method } });
      setContribution(c);
      setPhase(c.status === 'success' ? 'success' : c.status === 'failed' ? 'failed' : 'waiting');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  if (phase === 'waiting') {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: S.md, paddingTop: S.xl }}>
          <ActivityIndicator size="large" color={C.gold} />
          <H1 style={{ textAlign: 'center' }}>Valide sur ton téléphone</H1>
          <Muted style={{ textAlign: 'center' }}>
            Une demande de {money(contribution?.total ?? g.amount, g.currency)} a été envoyée sur ton {OPERATORS[contribution?.method ?? '']?.label ?? 'Mobile Money'}. Saisis ton code PIN dans la fenêtre de ton opérateur.
          </Muted>
        </View>
        <Card>
          <T2>🔒 Ikobi ne te demandera jamais ton code PIN. Tu le saisis uniquement dans la fenêtre officielle de ton opérateur.</T2>
        </Card>
        <Muted style={{ textAlign: 'center', fontSize: 13 }}>Tu peux quitter cet écran : tu recevras une notification dès que le paiement est confirmé.</Muted>
        <Button title="Fermer" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (phase === 'success') {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: S.md, paddingTop: S.xl }}>
          <Text style={{ fontSize: 64 }}>✅</Text>
          <H1 style={{ textAlign: 'center' }}>Cotisation reçue</H1>
          <Muted style={{ textAlign: 'center' }}>
            {money(g.amount, g.currency)} pour « {g.name} ». Merci !
          </Muted>
          {contribution && contribution.fee > 0 ? <Muted style={{ fontSize: 13 }}>Total débité : {money(contribution.total, g.currency)} (dont {money(contribution.fee, g.currency)} de frais)</Muted> : null}
          <Muted style={{ fontSize: 12 }}>Réf. {contribution?.reference}</Muted>
        </View>
        <Button title="Terminé" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (phase === 'failed') {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: S.md, paddingTop: S.xl }}>
          <Text style={{ fontSize: 64 }}>❌</Text>
          <H1 style={{ textAlign: 'center' }}>Paiement non abouti</H1>
          <Muted style={{ textAlign: 'center' }}>{contribution?.failureReason || 'Le paiement a été refusé ou annulé.'}</Muted>
        </View>
        <Button title="Réessayer" onPress={() => setPhase('form')} />
        <Button title="Fermer" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const c = g.currentCycle;
  return (
    <Screen>
      <Card style={{ alignItems: 'center' }}>
        <Label>{g.name}{c ? ` · tour ${c.number}` : ''}</Label>
        <Text style={{ color: C.gold, fontSize: 40, fontWeight: '900' }}>{money(g.amount, g.currency)}</Text>
        <Muted style={{ fontSize: 13, marginTop: S.sm }}>Moyens de paiement acceptés</Muted>
        <AcceptedOperators />
      </Card>

      <Field
        label="Numéro Mobile Money"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          const d = detectOperator(v);
          if (d) setMethod(d);
        }}
        hint={normalizePhone(phone) ? displayPhone(phone) : undefined}
      />

      <H2>Opérateur</H2>
      {Object.entries(OPERATOR_INFO).map(([k, o]) => (
        <Choice key={k} selected={method === k} onPress={() => setMethod(k)} title={o.label} subtitle={o.tagline} left={<OperatorBadge id={k} />} />
      ))}

      <Card>
        <H2>Récapitulatif</H2>
        <Row label="Cotisation" value={money(quote?.principal ?? g.amount, g.currency)} />
        <Row label="Frais de traitement" value={quote ? money(quote.fee, g.currency) : '—'} />
        <View style={{ height: 1, backgroundColor: C.border }} />
        <Row label="Total à payer" value={quote ? money(quote.total, g.currency) : '—'} strong />
        <Muted style={{ fontSize: 12 }}>
          Ta cotisation est comptée dès que l’opérateur confirme le paiement. Un paiement refusé ou annulé n’est pas débité.
        </Muted>
      </Card>

      <ErrorBox message={error} />
      <Button title={quote ? `Payer ${money(quote.total, g.currency)}` : 'Payer'} onPress={submit} loading={loading} disabled={!quote} />
      <Muted style={{ textAlign: 'center', fontSize: 13 }}>Paiement traité par AWA Network. Ikobi ne te demandera jamais ton code PIN.</Muted>
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: strong ? C.text : C.muted, fontSize: strong ? 17 : 15, fontWeight: strong ? '800' : '400' }}>{label}</Text>
      <Text style={{ color: C.text, fontSize: strong ? 17 : 15, fontWeight: strong ? '800' : '600' }}>{value}</Text>
    </View>
  );
}

const T2 = ({ children }: { children: React.ReactNode }) => <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{children}</Text>;
