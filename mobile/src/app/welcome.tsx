import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Muted } from '@/ui';
import { C, S } from '@/theme';

const POINTS = [
  { icon: '🤝', title: 'Ta likelemba, sans cahier', text: 'Membres, tours et cotisations suivis automatiquement.' },
  { icon: '📲', title: 'Mobile Money intégré', text: 'M-Pesa, Orange Money, Airtel Money, Afrimoney.' },
  { icon: '💬', title: 'Cotise aussi sur WhatsApp', text: 'Écris « cotiser » au bot Ikobi, valide avec ton PIN, c’est fait.' },
  { icon: '🔒', title: 'Transparent pour tous', text: 'Chacun voit qui a payé. Chaque mouvement d’argent est tracé.' },
];

export default function Welcome() {
  return (
    <SafeAreaView style={s.wrap}>
      <View style={{ gap: S.sm, marginTop: S.xl }}>
        <Text style={s.logo}>iKobi</Text>
        <Text style={s.tag}>Together. Securely.</Text>
        <Muted>La tontine moderne, entre personnes de confiance.</Muted>
      </View>
      <View style={{ gap: S.md }}>
        {POINTS.map((p) => (
          <View key={p.title} style={s.point}>
            <Text style={{ fontSize: 26 }}>{p.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.pTitle}>{p.title}</Text>
              <Muted style={{ fontSize: 14 }}>{p.text}</Muted>
            </View>
          </View>
        ))}
      </View>
      <View style={{ gap: S.sm }}>
        <Button title="Commencer" onPress={() => router.push('/login')} />
        <Muted style={{ textAlign: 'center', fontSize: 12 }}>
          En continuant, tu acceptes nos{' '}
          <Text style={{ color: C.gold }} onPress={() => router.push('/legal')}>
            conditions et notre politique de confidentialité
          </Text>
          .
        </Muted>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, padding: S.lg, justifyContent: 'space-between' },
  logo: { color: C.gold, fontSize: 52, fontWeight: '900', letterSpacing: -1.5 },
  tag: { color: C.text, fontSize: 20, fontWeight: '700' },
  point: { flexDirection: 'row', gap: S.md, alignItems: 'flex-start' },
  pTitle: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 2 },
});
