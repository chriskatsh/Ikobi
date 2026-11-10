import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { api, ApiError, type User } from '@/lib/api';
import { displayPhone } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Field, H1, Muted, Screen } from '@/ui';

export default function Verify() {
  const { phone, debug } = useLocalSearchParams<{ phone: string; debug?: string }>();
  const { signIn } = useSession();
  const [code, setCode] = useState(debug || '');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    if (!/^\d{6}$/.test(code)) {
      setError('Le code contient 6 chiffres.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: User }>('/auth/otp/verify', {
        body: { phone, code, ...(name.trim() ? { name: name.trim() } : {}) },
      });
      await signIn(r.token, r.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setResending(true);
    setError(null);
    try {
      await api('/auth/otp/request', { body: { phone } });
      setInfo('Nouveau code envoyé sur WhatsApp.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen>
      <H1>Code de connexion</H1>
      <Muted>Saisis le code à 6 chiffres reçu sur WhatsApp au {displayPhone(phone)}.</Muted>
      <Field
        label="Code"
        placeholder="••••••"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
        autoFocus
        style={{ fontSize: 26, letterSpacing: 8, textAlign: 'center' }}
      />
      <Field
        label="Ton nom (première connexion)"
        placeholder="Ex. Aline Mbuyi"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        textContentType="name"
        hint="Visible par les membres de tes tontines."
      />
      <ErrorBox message={error} />
      {info ? <Muted>{info}</Muted> : null}
      <Button title="Valider" onPress={submit} loading={loading} />
      <Button title="Renvoyer le code" variant="ghost" onPress={resend} loading={resending} />
    </Screen>
  );
}
