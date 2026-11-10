// Composants d'interaction iKobi (UX) : barre d'action fixe, onglets, squelettes, toast,
import type React from 'react';
// saisie de code, de téléphone et de montant, avatars, compteur, états vides et d'erreur.

import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, S } from '@/theme';

// --- Barre d'action fixe en bas d'écran
export function ActionBar({ children, note }: { children: ReactNode; note?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[k.bar, { paddingBottom: Math.max(insets.bottom, S.md) }]}>
      {note ? <Text style={k.barNote}>{note}</Text> : null}
      <View style={{ gap: S.sm }}>{children}</View>
    </View>
  );
}

// --- Onglets segmentés
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; badge?: number }[]; onChange: (v: T) => void }) {
  return (
    <View style={k.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) void Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[k.segItem, on && k.segItemOn]}>
            <Text style={[k.segText, on && k.segTextOn]} numberOfLines={1}>
              {o.label}
              {o.badge ? ` · ${o.badge}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- Squelettes de chargement
function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
  }, []);
  return reduce;
}

export function Skeleton({ height = 16, width = '100%', radius = 8, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const [o] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o, reduce]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height, width, borderRadius: radius, backgroundColor: C.surface2, opacity: o }, style]} />;
}

export function SkeletonCard() {
  return (
    <View style={k.skelCard} accessibilityLabel="Chargement">
      <Skeleton width="55%" height={20} />
      <Skeleton width="80%" />
      <Skeleton height={8} radius={4} />
    </View>
  );
}

// --- Toast (retour d'action bref)
const ToastCtx = createContext<{ show: (msg: string) => void }>({ show: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [o] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback(
    (m: string) => {
      setMsg(m);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      AccessibilityInfo.announceForAccessibility(m);
      Animated.timing(o, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(o, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
      }, 2200);
    },
    [o],
  );
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {msg ? (
        <Animated.View pointerEvents="none" style={[k.toast, { top: insets.top + S.sm, opacity: o, transform: [{ translateY: o.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}>
          <Text style={k.toastText}>✓ {msg}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

// --- Saisie de code à 6 chiffres (un seul champ caché : collage et remplissage automatique SMS/iOS)
export function CodeInput({ value, onChange, onComplete, length = 6, error, alphanumeric }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; length?: number; error?: boolean; alphanumeric?: boolean }) {
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(true);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel={`Code à ${length} chiffres, ${value.length} saisis`}>
      <View style={k.codeRow}>
        {Array.from({ length }, (_, i) => {
          const active = focused && i === Math.min(value.length, length - 1);
          return (
            <View key={i} style={[k.codeBox, active && k.codeBoxActive, error && k.codeBoxError, value[i] ? k.codeBoxFilled : null]}>
              <Text style={k.codeDigit}>{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => {
          const v = (alphanumeric ? t.toUpperCase().replace(/[^A-Z0-9]/g, '') : t.replace(/\D/g, '')).slice(0, length);
          onChange(v);
          if (v.length === length) onComplete?.(v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={alphanumeric ? 'default' : 'number-pad'}
        autoCapitalize="characters"
        autoCorrect={false}
        textContentType={alphanumeric ? 'none' : 'oneTimeCode'}
        autoComplete={alphanumeric ? 'off' : 'one-time-code'}
        maxLength={length}
        autoFocus
        caretHidden
        style={k.hiddenInput}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

// --- Numéro de téléphone RDC : préfixe +243 fixe, groupes « 81 234 5678 »
export function formatLocalPhone(digits: string) {
  const d = digits.replace(/\D/g, '').replace(/^243/, '').replace(/^0/, '').slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)].filter(Boolean).join(' ');
}

export function PhoneInput({ value, onChange, label, hint, error, autoFocus }: { value: string; onChange: (digits9: string) => void; label: string; hint?: string; error?: string | null; autoFocus?: boolean }) {
  return (
    <View style={{ gap: S.xs }}>
      <Text style={k.label}>{label}</Text>
      <View style={[k.phone, error ? { borderColor: C.red } : null]}>
        <Text style={k.prefix} numberOfLines={1}>+243</Text>
        <TextInput
          value={formatLocalPhone(value)}
          onChangeText={(t) => onChange(t.replace(/\D/g, '').replace(/^243/, '').replace(/^0/, '').slice(0, 9))}
          placeholder="81 234 5678"
          placeholderTextColor={C.faint}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus={autoFocus}
          selectionColor={C.gold}
          style={k.phoneInput}
          accessibilityLabel={label}
        />
      </View>
      {error ? <Text style={k.error}>{error}</Text> : hint ? <Text style={k.hint}>{hint}</Text> : null}
    </View>
  );
}

// --- Montant avec séparateur de milliers
export function formatThousands(n: string) {
  const d = n.replace(/\D/g, '');
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function AmountInput({ value, onChange, currency = 'FC', label, presets }: { value: string; onChange: (digits: string) => void; currency?: string; label: string; presets?: number[] }) {
  return (
    <View style={{ gap: S.sm }}>
      <Text style={k.label}>{label}</Text>
      <View style={k.amount}>
        <TextInput
          value={formatThousands(value)}
          onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 9))}
          placeholder="0"
          placeholderTextColor={C.faint}
          keyboardType="number-pad"
          selectionColor={C.gold}
          style={k.amountInput}
          accessibilityLabel={`${label}, en ${currency}`}
        />
        <Text style={k.amountCur}>{currency}</Text>
      </View>
      {presets ? (
        <View style={k.chips}>
          {presets.map((p) => (
            <Chip key={p} label={formatThousands(String(p))} selected={Number(value) === p} onPress={() => onChange(String(p))} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[k.chip, selected && k.chipOn]}>
      <Text style={[k.chipText, selected && k.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

// --- Compteur +/−
export function Stepper({ value, min, max, onChange, label, unit }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string; unit: string }) {
  const btn = (delta: number, sym: string, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta > 0 ? `Ajouter un ${unit}` : `Retirer un ${unit}`}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onChange(value + delta);
      }}
      style={[k.stepBtn, disabled && { opacity: 0.35 }]}>
      <Text style={k.stepSym}>{sym}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: S.sm }}>
      <Text style={k.label}>{label}</Text>
      <View style={k.stepper} accessibilityRole="adjustable" accessibilityValue={{ min, max, now: value }}>
        {btn(-1, '−', value <= min)}
        <Text style={k.stepValue}>
          {value} <Text style={k.stepUnit}>{unit}{value > 1 ? 's' : ''}</Text>
        </Text>
        {btn(1, '+', value >= max)}
      </View>
    </View>
  );
}

// --- Avatar à initiales, couleur stable par personne
const AV = ['#2BD9A0', '#6CA8FF', '#F2B441', '#FF8FA3', '#B794F6', '#5EEAD4', '#FDBA74'];
export function Avatar({ name, id, size = 36 }: { name: string; id: number; size?: number }) {
  const initials = (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  const color = AV[Math.abs(id) % AV.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '26', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontFamily: F.displayX, fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

// --- États vide et erreur
export function EmptyState({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return (
    <View style={k.state}>
      <Text style={{ fontSize: 40 }}>{icon}</Text>
      <Text style={k.stateTitle}>{title}</Text>
      <Text style={k.stateText}>{text}</Text>
      {action}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={k.state}>
      <Text style={{ fontSize: 34 }}>📡</Text>
      <Text style={k.stateTitle}>Impossible de charger</Text>
      <Text style={k.stateText}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={k.retry}>
        <Text style={{ color: C.text, fontFamily: F.bodyB }}>Réessayer</Text>
      </Pressable>
    </View>
  );
}

// --- Ligne libellé / valeur
export function KV({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'green' | 'gold' | 'red' }) {
  const color = tone === 'green' ? C.green : tone === 'red' ? C.red : tone === 'gold' ? C.gold : C.text;
  return (
    <View style={k.kv}>
      <Text style={[k.kvLabel, strong && { color: C.text, fontFamily: F.bodyB }]}>{label}</Text>
      <Text style={[k.kvValue, { color }, strong && { fontSize: 18, fontFamily: F.displayX }]}>{value}</Text>
    </View>
  );
}

// --- Indicateur d'étapes (assistant)
export function Steps({ current, total }: { current: number; total: number }) {
  return (
    <View style={k.steps} accessibilityLabel={`Étape ${current} sur ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[k.stepDot, i < current && { backgroundColor: C.gold }]} />
      ))}
    </View>
  );
}

const k = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, backgroundColor: C.bg, paddingHorizontal: S.md, paddingTop: S.md, gap: S.sm },
  barNote: { color: C.muted, fontSize: 13, textAlign: 'center' },
  seg: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: R.pill, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  segItem: { flex: 1, minHeight: 40, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segItemOn: { backgroundColor: C.surface2 },
  segText: { color: C.muted, fontFamily: F.bodyS, fontSize: 14 },
  segTextOn: { color: C.text },
  skelCard: { backgroundColor: C.surface, borderRadius: R.md, padding: S.md, gap: S.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: C.surface2, borderColor: C.gold, borderWidth: 1, borderRadius: R.pill, paddingHorizontal: S.lg, paddingVertical: 10 },
  toastText: { color: C.text, fontFamily: F.bodyB },
  codeRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  codeBox: { flex: 1, aspectRatio: 0.82, maxWidth: 56, borderRadius: R.sm, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  codeBoxActive: { borderColor: C.gold },
  codeBoxFilled: { backgroundColor: C.surface2 },
  codeBoxError: { borderColor: C.red },
  codeDigit: { color: C.text, fontSize: 26, fontFamily: F.displayX },
  hiddenInput: { position: 'absolute', opacity: 0.01, width: 1, height: 1 },
  label: { color: C.muted, fontSize: 14, fontFamily: F.bodyS },
  hint: { color: C.muted, fontSize: 13 },
  error: { color: C.red, fontSize: 13 },
  phone: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, minHeight: 56 },
  prefix: { color: C.text, fontSize: 17, fontFamily: F.bodyS, paddingHorizontal: S.md, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border },
  phoneInput: { flex: 1, minWidth: 0, color: C.text, fontSize: 20, fontFamily: F.bodyS, paddingHorizontal: S.md, letterSpacing: 0.5, minHeight: 56 },
  amount: { flexDirection: 'row', alignItems: 'baseline', borderBottomWidth: 2, borderBottomColor: C.gold, paddingBottom: 4 },
  amountInput: { flex: 1, color: C.text, fontSize: 40, fontFamily: F.displayX, padding: 0, minHeight: 56 },
  amountCur: { color: C.muted, fontSize: 22, fontFamily: F.bodyB },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  chip: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipOn: { borderColor: C.gold, backgroundColor: C.goldDim },
  chipText: { color: C.text, fontFamily: F.bodyS },
  chipTextOn: { color: C.gold },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderRadius: R.md, padding: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  stepBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  stepSym: { color: C.text, fontSize: 26, fontFamily: F.bodyS, lineHeight: 30 },
  stepValue: { color: C.text, fontSize: 24, fontFamily: F.displayX },
  stepUnit: { color: C.muted, fontSize: 16, fontFamily: F.bodyS },
  state: { alignItems: 'center', gap: S.sm, paddingVertical: S.xl, paddingHorizontal: S.md },
  stateTitle: { color: C.text, fontSize: 19, fontFamily: F.bodyB, textAlign: 'center' },
  stateText: { color: C.muted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  retry: { marginTop: S.sm, paddingHorizontal: S.lg, minHeight: 44, justifyContent: 'center', borderRadius: R.pill, borderWidth: 1, borderColor: C.border },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: S.md, paddingVertical: 3 },
  kvLabel: { color: C.muted, fontSize: 15, flexShrink: 1 },
  kvValue: { fontSize: 15, fontFamily: F.bodyS, textAlign: 'right' },
  steps: { flexDirection: 'row', gap: 6 },
  stepDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.surface2 },
});
