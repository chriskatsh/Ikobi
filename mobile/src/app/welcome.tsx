import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/ui';
import { C, F, S } from '@/theme';

const POINTS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: 'people-outline', title: 'Votre likelemba, sans cahier', text: 'Tours, cotisations et cagnottes suivis pour tout le groupe.' },
  { icon: 'phone-portrait-outline', title: 'Mobile Money intégré', text: 'M-Pesa, Orange Money, Airtel Money et Afrimoney.' },
  { icon: 'logo-whatsapp', title: 'Aussi sur WhatsApp', text: 'Écrivez « cotiser » à l’assistant, validez avec votre PIN.' },
];

export default function Welcome() {
  return (
    <View style={s.root}>
      <LinearGradient colors={['#0E2A2A', C.bg]} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={s.wrap}>
        <View style={s.top}>
          <Image source={require('../../assets/images/icon.png')} style={s.logo} contentFit="contain" accessibilityIgnoresInvertColors />
          <Text style={s.brand}>iKobi</Text>
        </View>

        <View style={{ gap: S.md }}>
          <Text style={s.title} accessibilityRole="header">
            Votre likelemba,{'\n'}sans cahier ni doute.
          </Text>
          <Text style={s.lead}>La tontine organisée entre personnes de confiance. Tout le groupe voit qui a payé.</Text>
        </View>

        <View style={{ gap: S.lg }}>
          {POINTS.map((p) => (
            <View key={p.title} style={s.point}>
              <View style={s.icon}>
                <Ionicons name={p.icon} size={22} color={C.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pTitle}>{p.title}</Text>
                <Text style={s.pText}>{p.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ gap: S.md }}>
          <Button title="Commencer" onPress={() => router.push('/login')} />
          <Text style={s.legal}>
            En continuant, vous acceptez nos{' '}
            <Text style={{ color: C.gold }} onPress={() => router.push('/legal')} accessibilityRole="link">
              conditions et notre politique de confidentialité
            </Text>
            .
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  wrap: { flex: 1, paddingHorizontal: S.lg, paddingBottom: S.md, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: S.md },
  logo: { width: 40, height: 40, borderRadius: 10 },
  brand: { color: C.text, fontFamily: F.displayX, fontSize: 24, letterSpacing: -0.6 },
  title: { color: C.text, fontFamily: F.displayX, fontSize: 38, lineHeight: 42, letterSpacing: -1.2 },
  lead: { color: C.muted, fontFamily: F.body, fontSize: 17, lineHeight: 24 },
  point: { flexDirection: 'row', gap: S.md, alignItems: 'flex-start' },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.goldDim, alignItems: 'center', justifyContent: 'center' },
  pTitle: { color: C.text, fontFamily: F.bodyS, fontSize: 16, marginBottom: 2 },
  pText: { color: C.muted, fontFamily: F.body, fontSize: 14, lineHeight: 20 },
  legal: { color: C.muted, fontFamily: F.body, fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
