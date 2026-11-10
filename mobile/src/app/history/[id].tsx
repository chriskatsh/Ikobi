import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, type History } from '@/lib/api';
import { dateFr, money } from '@/lib/format';
import { OPERATOR_INFO } from '@/operators';
import { Avatar, Card, EmptyState, ErrorState, Pill, Screen, Segmented, SkeletonCard } from '@/ui';
import { C, F, S } from '@/theme';

type Tab = 'cotisations' | 'versements';

export default function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [h, setH] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('cotisations');

  const fetchIt = useCallback(() => api<History>(`/groups/${id}/history`), [id]);
  useEffect(() => {
    let alive = true;
    fetchIt().then((r) => alive && setH(r)).catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [fetchIt]);

  if (!h) {
    return <Screen>{error ? <ErrorState message={error} onRetry={() => { setError(null); fetchIt().then(setH).catch((e) => setError(e.message)); }} /> : <><SkeletonCard /><SkeletonCard /></>}</Screen>;
  }

  return (
    <Screen>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'cotisations', label: 'Cotisations', badge: h.contributions.length },
          { value: 'versements', label: 'Versements', badge: h.payouts.length },
        ]}
      />
      {tab === 'cotisations' ? (
        h.contributions.length === 0 ? (
          <EmptyState icon="🧾" title="Aucune cotisation" text="Les paiements confirmés par les opérateurs apparaîtront ici." />
        ) : (
          <Card style={{ gap: 0 }}>
            {h.contributions.map((c, i) => (
              <View key={c.id} style={[s.row, i > 0 && s.border]}>
                <Avatar name={c.name} id={c.id + 1000} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{c.name}</Text>
                  <Text style={s.meta}>
                    Tour {c.cycle} · {OPERATOR_INFO[c.method]?.label ?? c.method}
                    {c.channel === 'whatsapp' ? ' · WhatsApp' : ''} · {dateFr(String(c.at))}
                  </Text>
                </View>
                <Text style={s.plus}>+{money(c.amount, c.currency)}</Text>
              </View>
            ))}
          </Card>
        )
      ) : h.payouts.length === 0 ? (
        <EmptyState icon="💰" title="Aucun versement" text="Les cagnottes envoyées aux bénéficiaires apparaîtront ici." />
      ) : (
        <Card style={{ gap: 0 }}>
          {h.payouts.map((p, i) => (
            <View key={p.id} style={[s.row, i > 0 && s.border]}>
              <Avatar name={p.name} id={p.id + 2000} />
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{p.name}</Text>
                <Text style={s.meta}>Tour {p.cycle} · {dateFr(String(p.at))}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={s.amount}>{money(p.amount, p.currency)}</Text>
                <Pill text={p.status === 'success' ? 'Versé' : p.status === 'failed' ? 'Échec' : 'En cours'} tone={p.status === 'success' ? 'green' : p.status === 'failed' ? 'red' : 'gold'} />
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: 12 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  name: { color: C.text, fontFamily: F.bodyS, fontSize: 15 },
  meta: { color: C.muted, fontFamily: F.body, fontSize: 13 },
  plus: { color: C.green, fontFamily: F.display, fontSize: 15 },
  amount: { color: C.text, fontFamily: F.display, fontSize: 15 },
});
