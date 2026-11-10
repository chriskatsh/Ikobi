import { router } from 'expo-router';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { normalizePhone } from '@/lib/format';
import { Button, ErrorBox, Field, H1, Muted, Screen } from '@/ui';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const p = normalizePhone(phone);
    if (!p) {
      setError('Numéro invalide. Exemple : 0812345678');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ phone: string; debugCode?: string }>('/auth/otp/request', { body: { phone: p } });
      router.push({ pathname: '/verify', params: { phone: r.phone, debug: r.debugCode ?? '' } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <H1>Ton numéro</H1>
      <Muted>Nous t’envoyons un code de connexion sur WhatsApp. Pas de mot de passe à retenir.</Muted>
      <Field
        label="Numéro de téléphone"
        placeholder="081 234 5678"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        value={phone}
        onChangeText={setPhone}
        onSubmitEditing={submit}
        autoFocus
        hint="Numéro de la RDC (+243)"
      />
      <ErrorBox message={error} />
      <Button title="Recevoir mon code" onPress={submit} loading={loading} />
    </Screen>
  );
}
