import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, ApiError, type GroupDetail } from '@/lib/api';
import { detectOperator, FREQ, money, normalizePhone, todayIso } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, Choice, ErrorBox, Field, Label, Muted, OperatorDot, Screen } from '@/ui';
import { OPERATORS, S } from '@/theme';

export default function Create() {
  const { user } = useSession();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'CDF'>('USD');
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [maxMembers, setMaxMembers] = useState('10');
  const [startDate, setStartDate] = useState(todayIso());
  const [payoutPhone, setPayoutPhone] = useState(user?.phone ? '0' + user.phone.slice(3) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amt = Number(amount.replace(',', '.'));
  const n = Number(maxMembers);
  const op = detectOperator(payoutPhone);

  async function submit() {
    setError(null);
    if (name.trim().length < 2) return setError('Donne un nom à ta tontine.');
    if (!(amt > 0)) return setError('Indique le montant de la cotisation.');
    if (!(n >= 2 && n <= 50)) return setError('Entre 2 et 50 membres.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return setError('Date au format AAAA-MM-JJ.');
    if (!normalizePhone(payoutPhone)) return setError('Numéro Mobile Money invalide.');
    setLoading(true);
    try {
      const g = await api<GroupDetail>('/groups', {
        body: { name: name.trim(), amount: amt, currency, frequency, maxMembers: n, startDate, payoutPhone },
      });
      router.replace({ pathname: '/group/[id]', params: { id: String(g.id), created: '1' } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Field label="Nom" placeholder="Ex. Likelemba de la famille" value={name} onChangeText={setName} maxLength={80} />

      <Label>Devise</Label>
      <View style={{ flexDirection: 'row', gap: S.sm }}>
        {(['USD', 'CDF'] as const).map((c) => (
          <Button key={c} title={c === 'USD' ? 'Dollar ($)' : 'Franc (FC)'} variant={currency === c ? 'primary' : 'secondary'} onPress={() => setCurrency(c)} style={{ flex: 1 }} />
        ))}
      </View>

      <Field label="Cotisation par membre et par tour" placeholder={currency === 'USD' ? '50' : '100000'} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />

      <Label>Fréquence</Label>
      {(['weekly', 'biweekly', 'monthly'] as const).map((f) => (
        <Choice key={f} selected={frequency === f} onPress={() => setFrequency(f)} title={FREQ[f]} />
      ))}

      <Field label="Nombre maximum de membres" keyboardType="number-pad" value={maxMembers} onChangeText={setMaxMembers} hint="Chaque membre reçoit la cagnotte une fois : autant de tours que de membres." />
      <Field label="Première échéance" value={startDate} onChangeText={setStartDate} placeholder="AAAA-MM-JJ" hint="Tu pourras démarrer quand tout le monde a rejoint." />
      <Field
        label="Ton numéro pour recevoir la cagnotte"
        keyboardType="phone-pad"
        value={payoutPhone}
        onChangeText={setPayoutPhone}
        hint={op ? `Opérateur détecté : ${OPERATORS[op].label}` : 'M-Pesa, Orange Money, Airtel Money ou Afrimoney'}
      />
      {op ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
          <OperatorDot id={op} />
          <Muted>{OPERATORS[op].label}</Muted>
        </View>
      ) : null}

      {amt > 0 && n >= 2 ? (
        <Muted>
          Chaque tour, {n - 1} membres versent {money(amt, currency)} : le bénéficiaire reçoit {money(amt * (n - 1), currency)}.
        </Muted>
      ) : null}

      <ErrorBox message={error} />
      <Button title="Créer la tontine" onPress={submit} loading={loading} />
    </Screen>
  );
}
