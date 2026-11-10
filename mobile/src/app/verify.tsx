import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { api, ApiError, type User } from '@/lib/api';
import { displayPhone } from '@/lib/format';
import { useSession } from '@/lib/session';
import { ActionBar, Button, CodeInput, H1, Muted, Screen, useToast } from '@/ui';
import { C, F, S } from '@/theme';

const RESEND_AFTER = 60;

export default function Verify() {
  const { phone, debug } = useLocalSearchParams<{ phone: string; debug?: string }>();
  const { signIn } = useSession();
  const toast = useToast();
  // Mode développement : le code est pré-rempli par l'API de test.
  const [code, setCode] = useState(debug || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_AFTER);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(value: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: User }>('/auth/otp/verify', { body: { phone, code: value } });
      await signIn(r.token, r.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      await api('/auth/otp/request', { body: { phone } });
      setWait(RESEND_AFTER);
      toast.show('Nouveau code envoyé');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    }
  }

  return (
    <Screen footer={code.length === 6 && !loading ? <ActionBar><Button title="Valider" onPress={() => submit(code)} /></ActionBar> : undefined}>
      <View style={{ gap: S.sm, marginTop: S.sm }}>
        <H1>Code de connexion</H1>
        <Muted>Saisissez le code à 6 chiffres reçu sur WhatsApp au {displayPhone(phone)}.</Muted>
      </View>
      <CodeInput value={code} onChange={(v) => { setCode(v); setError(null); }} onComplete={submit} error={Boolean(error)} />
      <View style={{ minHeight: 24, alignItems: 'center' }}>
        {loading ? <ActivityIndicator color={C.gold} /> : error ? <Text style={{ color: C.red, fontFamily: F.bodyM, textAlign: 'center' }}>{error}</Text> : null}
      </View>
      <View style={{ alignItems: 'center', gap: S.md }}>
        {wait > 0 ? (
          <Muted>Renvoyer le code dans {wait} s</Muted>
        ) : (
          <Pressable accessibilityRole="button" onPress={resend} hitSlop={10}>
            <Text style={{ color: C.gold, fontFamily: F.bodyB, fontSize: 16 }}>Renvoyer le code</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: C.muted, fontFamily: F.bodyM }}>Changer de numéro</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
