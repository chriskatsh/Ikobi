import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { api, ApiError, type GroupDetail } from '@/lib/api';
import { dateFr, detectOperator, FREQ, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { OPERATOR_INFO } from '@/operators';
import { ActionBar, Button, Card, CodeInput, ErrorBox, H1, KV, Muted, PhoneInput, Screen } from '@/ui';
import { C, F, S } from '@/theme';

type Preview = {
  id: number; name: string; amount: number; currency: string; frequency: string; startDate: string;
  members: number; maxMembers: number; potWhenFull: number; payoutFees: { net: number; serviceFee: number; processingFee: number }; organizer: string; status: string; canJoin: boolean; alreadyMember: boolean;
};

const CODE_LEN = 6;

export default function Join() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { user } = useSession();
  const [code, setCode] = useState((params.code ?? '').toUpperCase().slice(0, CODE_LEN));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [payout, setPayout] = useState(user?.phone ? user.phone.slice(3) : '');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const op = payout.length === 9 ? detectOperator('243' + payout) : null;

  async function lookup(c: string) {
    setChecking(true);
    setError(null);
    try {
      setPreview(await api<Preview>(`/groups/preview?code=${encodeURIComponent(c)}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      setPreview(null);
    } finally {
      setChecking(false);
    }
  }

  async function join() {
    setLoading(true);
    setError(null);
    try {
      const g = await api<GroupDetail>('/groups/join', { body: { code, payoutPhone: '243' + payout } });
      router.replace({ pathname: '/group/[id]', params: { id: String(g.id) } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  const footer = preview ? (
    <ActionBar>
      {preview.alreadyMember ? (
        <Button title="Ouvrir la tontine" onPress={() => router.replace({ pathname: '/group/[id]', params: { id: String(preview.id) } })} />
      ) : (
        <Button title={`Rejoindre « ${preview.name} »`} onPress={join} loading={loading} disabled={!preview.canJoin || payout.length !== 9} />
      )}
    </ActionBar>
  ) : undefined;

  return (
    <Screen footer={footer}>
      <View style={{ gap: S.xs }}>
        <H1>Rejoindre une tontine</H1>
        <Muted>Saisissez le code de 6 caractères reçu de l’organisateur.</Muted>
      </View>

      <CodeAlpha value={code} onChange={(v) => { setCode(v); setPreview(null); setError(null); if (v.length === CODE_LEN) void lookup(v); }} />
      {checking ? <ActivityIndicator color={C.gold} /> : null}
      <ErrorBox message={error} />

      {preview ? (
        <>
          <Card style={{ gap: 4 }}>
            <Text style={s.name}>{preview.name}</Text>
            <Text style={s.by}>Organisée par {preview.organizer}</Text>
            <View style={s.sep} />
            <KV label="Cotisation" value={`${money(preview.amount, preview.currency)} · ${FREQ[preview.frequency].toLowerCase()}`} />
            <KV label="Membres" value={`${preview.members} sur ${preview.maxMembers}`} />
            <KV label="Première échéance" value={dateFr(preview.startDate)} />
            <View style={s.sep} />
            <KV label="Cagnotte à votre tour" value={money(preview.potWhenFull, preview.currency)} />
            <KV label="Frais de service et de retrait" value={`− ${money(preview.payoutFees.serviceFee + preview.payoutFees.processingFee, preview.currency)}`} />
            <KV label="Vous recevrez" value={money(preview.payoutFees.net, preview.currency)} strong tone="green" />
          </Card>
          {!preview.canJoin && !preview.alreadyMember ? (
            <ErrorBox message={preview.status !== 'forming' ? 'Cette tontine a déjà démarré : on ne peut plus la rejoindre.' : 'Cette tontine est complète.'} />
          ) : null}
          {preview.canJoin ? (
            <>
              <View style={s.engage}>
                <Ionicons name="information-circle-outline" size={18} color={C.muted} />
                <Text style={s.engageText}>
                  En rejoignant, vous vous engagez à cotiser {money(preview.amount, preview.currency)} à chaque tour, jusqu’au dernier, plus les frais de paiement affichés avant chaque cotisation.
                </Text>
              </View>
              <PhoneInput label="Numéro pour recevoir votre cagnotte" value={payout} onChange={setPayout} hint={op ? `Opérateur détecté : ${OPERATOR_INFO[op].label}` : undefined} />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

// Code alphanumérique en 6 cases (lettres en majuscules)
function CodeAlpha({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <CodeInput value={value} onChange={(v) => onChange(v)} length={CODE_LEN} alphanumeric />;
}

const s = StyleSheet.create({
  name: { color: C.text, fontFamily: F.display, fontSize: 22 },
  by: { color: C.muted, fontFamily: F.body, fontSize: 14 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: S.sm },
  engage: { flexDirection: 'row', gap: S.sm, alignItems: 'flex-start' },
  engageText: { flex: 1, color: C.muted, fontFamily: F.body, fontSize: 14, lineHeight: 20 },
});
