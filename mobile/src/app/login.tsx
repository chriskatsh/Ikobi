import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { detectOperator } from '@/lib/format';
import { OPERATOR_INFO } from '@/operators';
import { ActionBar, Button, ErrorBox, H1, Muted, PhoneInput, Screen } from '@/ui';
import { C, F, S } from '@/theme';

export default function Login() {
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = digits.length === 9;
  const op = valid ? detectOperator('243' + digits) : null;

  async function submit() {
    if (!valid) {
      setError('Le numéro contient 9 chiffres après +243. Exemple : 81 234 5678');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ phone: string; debugCode?: string }>('/auth/otp/request', { body: { phone: '243' + digits } });
      router.push({ pathname: '/verify', params: { phone: r.phone, debug: r.debugCode ?? '' } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen
      footer={
        <ActionBar>
          <Button title="Recevoir mon code" onPress={submit} loading={loading} disabled={!valid} icon={<Ionicons name="logo-whatsapp" size={18} color="#04140F" />} />
        </ActionBar>
      }>
      <View style={{ gap: S.sm, marginTop: S.sm }}>
        <H1>Votre numéro</H1>
        <Muted>Nous vous envoyons un code de connexion sur WhatsApp. Aucun mot de passe à retenir.</Muted>
      </View>
      <PhoneInput label="Numéro de téléphone" value={digits} onChange={(d) => { setDigits(d); setError(null); }} error={error} autoFocus />
      {op ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="checkmark-circle" size={16} color={C.green} />
          <Text style={{ color: C.muted, fontFamily: F.bodyM }}>{OPERATOR_INFO[op].label}</Text>
        </View>
      ) : null}
      <ErrorBox message={error && !error.startsWith('Le numéro') ? error : null} />
    </Screen>
  );
}
