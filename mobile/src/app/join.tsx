import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { api, ApiError, type GroupDetail } from '@/lib/api';
import { detectOperator, normalizePhone } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Field, Muted, Screen } from '@/ui';
import { OPERATORS } from '@/theme';

export default function Join() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { user } = useSession();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [payoutPhone, setPayoutPhone] = useState(user?.phone ? '0' + user.phone.slice(3) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const op = detectOperator(payoutPhone);

  async function submit() {
    setError(null);
    if (code.trim().length < 4) return setError("Saisis le code d'invitation reçu.");
    if (!normalizePhone(payoutPhone)) return setError('Numéro Mobile Money invalide.');
    setLoading(true);
    try {
      const g = await api<GroupDetail>('/groups/join', { body: { code: code.trim(), payoutPhone } });
      router.replace({ pathname: '/group/[id]', params: { id: String(g.id) } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Muted>L’organisateur de la tontine t’a envoyé un code de 6 caractères.</Muted>
      <Field
        label="Code d'invitation"
        placeholder="K7PQ2M"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center' }}
        autoFocus={!params.code}
      />
      <Field
        label="Numéro pour recevoir la cagnotte"
        keyboardType="phone-pad"
        value={payoutPhone}
        onChangeText={setPayoutPhone}
        hint={op ? `Opérateur détecté : ${OPERATORS[op].label}` : 'M-Pesa, Orange Money, Airtel Money ou Afrimoney'}
      />
      <ErrorBox message={error} />
      <Button title="Rejoindre la tontine" onPress={submit} loading={loading} />
    </Screen>
  );
}
