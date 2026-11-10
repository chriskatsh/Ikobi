import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, type History } from '@/lib/api';
import { dateFr, money } from '@/lib/format';
import { Card, ErrorBox, H2, Loading, Muted, Pill, Screen, T } from '@/ui';
import { C, OPERATORS, S } from '@/theme';

export default function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [h, setH] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<History>(`/groups/${id}/history`).then(setH).catch((e) => setError(e.message));
  }, [id]);

  if (!h) return error ? <Screen><ErrorBox message={error} /></Screen> : <Loading />;

  return (
    <Screen>
      <Card>
        <H2>Cagnottes versées</H2>
        {h.payouts.length === 0 ? <Muted>Aucun versement pour l’instant.</Muted> : null}
        {h.payouts.map((p) => (
          <View key={p.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <T>{p.name}</T>
              <Muted style={{ fontSize: 13 }}>Tour {p.cycle} · {dateFr(String(p.at))}</Muted>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <T style={{ fontWeight: '700' }}>{money(p.amount, p.currency)}</T>
              <Pill text={p.status === 'success' ? 'Versé' : p.status === 'failed' ? 'Échec' : 'En cours'} tone={p.status === 'success' ? 'green' : p.status === 'failed' ? 'red' : 'gold'} />
            </View>
          </View>
        ))}
      </Card>
      <Card>
        <H2>Cotisations reçues</H2>
        {h.contributions.length === 0 ? <Muted>Aucune cotisation pour l’instant.</Muted> : null}
        {h.contributions.map((c) => (
          <View key={c.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <T>{c.name}</T>
              <Muted style={{ fontSize: 13 }}>
                Tour {c.cycle} · {OPERATORS[c.method]?.label ?? c.method}
                {c.channel === 'whatsapp' ? ' · via WhatsApp' : ''} · {dateFr(String(c.at))}
              </Muted>
            </View>
            <T style={{ fontWeight: '700', color: C.green }}>+{money(c.amount, c.currency)}</T>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
});
