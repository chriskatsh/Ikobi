// Badges des opérateurs Mobile Money acceptés.
//
// Logos officiels : dépose les fichiers PNG fournis par MOKO ou par les opérateurs dans
// assets/operators/ (mpesa.png, orange.png, airtel.png, africell.png), puis décommente
// les lignes correspondantes dans LOGOS. Sans logo, un badge aux couleurs de l'opérateur s'affiche.

import { Image, type ImageSourcePropType, StyleSheet, Text, View } from 'react-native';

export const OPERATOR_INFO: Record<string, { label: string; short: string; bg: string; fg: string; tagline: string }> = {
  mpesa: { label: 'M-Pesa', short: 'M-PESA', bg: '#E60000', fg: '#FFFFFF', tagline: 'Vodacom' },
  orange: { label: 'Orange Money', short: 'orange', bg: '#000000', fg: '#FF7900', tagline: 'Orange' },
  airtel: { label: 'Airtel Money', short: 'airtel', bg: '#ED1C24', fg: '#FFFFFF', tagline: 'Airtel' },
  africell: { label: 'Afrimoney', short: 'afri', bg: '#5B2A86', fg: '#FFFFFF', tagline: 'Africell' },
};

const LOGOS: Partial<Record<string, ImageSourcePropType>> = {
  // mpesa: require('../assets/operators/mpesa.png'),
  // orange: require('../assets/operators/orange.png'),
  // airtel: require('../assets/operators/airtel.png'),
  // africell: require('../assets/operators/africell.png'),
};

export function OperatorBadge({ id, size = 44 }: { id: string; size?: number }) {
  const o = OPERATOR_INFO[id];
  const logo = LOGOS[id];
  const radius = size * 0.24;
  if (logo) {
    return (
      <Image
        source={logo}
        accessibilityLabel={o?.label}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#fff' }}
        resizeMode="contain"
      />
    );
  }
  return (
    <View
      accessibilityLabel={o?.label}
      style={[s.badge, { width: size, height: size, borderRadius: radius, backgroundColor: o?.bg ?? '#333', borderColor: id === 'orange' ? '#FF7900' : 'transparent' }]}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[s.short, { color: o?.fg ?? '#fff', fontSize: size * Math.min(0.28, 1.05 / (o?.short.length ?? 1)) }]}>
        {o?.short ?? '?'}
      </Text>
      <View style={[s.wave, { backgroundColor: o?.fg ?? '#fff', width: size * 0.42 }]} />
    </View>
  );
}

// Rangée « Moyens de paiement acceptés »
export function AcceptedOperators({ size = 34 }: { size?: number }) {
  return (
    <View style={s.row}>
      {Object.keys(OPERATOR_INFO).map((id) => (
        <OperatorBadge key={id} id={id} size={size} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, paddingHorizontal: 1, gap: 3 },
  short: { fontWeight: '900', letterSpacing: -0.3 },
  wave: { height: 2.5, borderRadius: 2, opacity: 0.85 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
});
