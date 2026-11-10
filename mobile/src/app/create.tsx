import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, ApiError, type GroupDetail } from '@/lib/api';
import { dateFr, detectOperator, FREQ, money, todayIso } from '@/lib/format';
import { useSession } from '@/lib/session';
import { OPERATOR_INFO } from '@/operators';
import { ActionBar, AmountInput, Button, Card, Chip, ErrorBox, Field, H1, KV, Muted, PhoneInput, Screen, Segmented, Stepper, Steps } from '@/ui';
import { C, F, S } from '@/theme';

type Freq = 'weekly' | 'biweekly' | 'monthly';

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nextMonday(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  const delta = ((8 - d.getUTCDay()) % 7) || 7;
  return addDays(iso, delta);
}
function firstOfNextMonth(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}
function endDate(start: string, freq: Freq, tours: number) {
  if (freq === 'monthly') {
    const d = new Date(start + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + tours - 1);
    return d.toISOString().slice(0, 10);
  }
  return addDays(start, (freq === 'weekly' ? 7 : 14) * (tours - 1));
}

const PRESETS = [5000, 10000, 20000, 50000, 100000];

export default function Create() {
  const { user } = useSession();
  const today = todayIso();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Freq>('monthly');
  const [members, setMembers] = useState(6);
  const [startDate, setStartDate] = useState(firstOfNextMonth(today));
  const [payout, setPayout] = useState(user?.phone ? user.phone.slice(3) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amt = Number(amount);
  const quick = useMemo(
    () => [
      { label: 'Aujourd’hui', date: today },
      { label: 'Lundi prochain', date: nextMonday(today) },
      { label: '1er du mois prochain', date: firstOfNextMonth(today) },
    ],
    [today],
  );
  const op = payout.length === 9 ? detectOperator('243' + payout) : null;
  const canNext = step === 1 ? name.trim().length >= 2 && amt >= 500 : step === 2 ? startDate >= today : payout.length === 9;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const g = await api<GroupDetail>('/groups', {
        body: { name: name.trim(), amount: amt, currency: 'CDF', frequency, maxMembers: members, startDate, payoutPhone: '243' + payout },
      });
      router.replace({ pathname: '/group/[id]', params: { id: String(g.id), created: '1' } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <ActionBar note={step === 1 && amt > 0 && amt < 500 ? 'Montant minimum : 500 FC' : undefined}>
      <View style={{ flexDirection: 'row', gap: S.sm }}>
        {step > 1 ? <Button title="Retour" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
        <Button
          title={step < 3 ? 'Continuer' : 'Créer la tontine'}
          onPress={() => (step < 3 ? setStep(step + 1) : submit())}
          loading={loading}
          disabled={!canNext}
          style={{ flex: 2 }}
        />
      </View>
    </ActionBar>
  );

  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title: `Nouvelle tontine · ${step}/3` }} />
      <Steps current={step} total={3} />

      {step === 1 && (
        <>
          <View style={{ gap: S.xs }}>
            <H1>L’essentiel</H1>
            <Muted>Le nom que verront les membres, et ce que chacun cotise à chaque tour.</Muted>
          </View>
          <Field label="Nom de la tontine" placeholder="Ex. Likelemba de la famille" value={name} onChangeText={setName} maxLength={80} autoFocus />
          <AmountInput label="Cotisation par membre et par tour" value={amount} onChange={setAmount} presets={PRESETS} />
          <Muted style={{ fontSize: 13 }}>Les paiements se font en francs congolais (CDF).</Muted>
        </>
      )}

      {step === 2 && (
        <>
          <View style={{ gap: S.xs }}>
            <H1>Le rythme</H1>
            <Muted>Chaque membre reçoit la cagnotte une fois : il y a autant de tours que de membres.</Muted>
          </View>
          <View style={{ gap: S.sm }}>
            <Text style={s.label}>Fréquence des tours</Text>
            <Segmented<Freq>
              value={frequency}
              onChange={setFrequency}
              options={[
                { value: 'weekly', label: 'Semaine' },
                { value: 'biweekly', label: '2 semaines' },
                { value: 'monthly', label: 'Mois' },
              ]}
            />
          </View>
          <Stepper label="Nombre de membres, vous compris" value={members} min={2} max={50} onChange={setMembers} unit="membre" />
          <View style={{ gap: S.sm }}>
            <Text style={s.label}>Première échéance</Text>
            <View style={s.chips}>
              {quick.map((q) => (
                <Chip key={q.label} label={q.label} selected={startDate === q.date} onPress={() => setStartDate(q.date)} />
              ))}
            </View>
            <View style={s.dateRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Un jour plus tôt" disabled={startDate <= today} onPress={() => setStartDate(addDays(startDate, -1))} style={[s.dateBtn, startDate <= today && { opacity: 0.35 }]}>
                <Ionicons name="chevron-back" size={20} color={C.text} />
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={s.date}>{dateFr(startDate)}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Un jour plus tard" onPress={() => setStartDate(addDays(startDate, 1))} style={s.dateBtn}>
                <Ionicons name="chevron-forward" size={20} color={C.text} />
              </Pressable>
            </View>
          </View>
        </>
      )}

      {step === 3 && (
        <>
          <View style={{ gap: S.xs }}>
            <H1>Récapitulatif</H1>
            <Muted>Vérifiez avant de créer. Vous pourrez démarrer quand tout le monde aura rejoint.</Muted>
          </View>
          <Card style={{ gap: 4 }}>
            <Text style={s.recapName}>{name.trim()}</Text>
            <KV label="Cotisation" value={`${money(amt, 'CDF')} · ${FREQ[frequency].toLowerCase()}`} />
            <KV label="Membres" value={`${members}`} />
            <KV label="Première échéance" value={dateFr(startDate)} />
            <KV label="Dernière échéance" value={dateFr(endDate(startDate, frequency, members))} />
            <View style={s.sep} />
            <KV label="Cagnotte à chaque tour" value={money(amt * (members - 1), 'CDF')} strong tone="green" />
          </Card>
          <PhoneInput label="Votre numéro pour recevoir la cagnotte" value={payout} onChange={setPayout} hint={op ? `Opérateur détecté : ${OPERATOR_INFO[op].label}` : 'M-Pesa, Orange Money, Airtel Money ou Afrimoney'} />
          <ErrorBox message={error} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { color: C.muted, fontSize: 14, fontFamily: F.bodyS },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, padding: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  dateBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  date: { color: C.text, fontFamily: F.display, fontSize: 20 },
  recapName: { color: C.text, fontFamily: F.display, fontSize: 22, marginBottom: S.sm },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: S.sm },
});
