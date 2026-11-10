import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { displayPhone } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Avatar, Button, Card, ErrorBox, Field, Screen, useToast } from '@/ui';
import { C, F, S } from '@/theme';

const WA_BOT = process.env.EXPO_PUBLIC_WHATSAPP_NUMBER || '';
const SUPPORT_EMAIL = 'contact@ikobi.app';

export default function Profile() {
  const { user, signOut, refreshUser } = useSession();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api('/me', { method: 'PATCH', body: { name: name.trim() } });
      await refreshUser();
      setEditing(false);
      toast.show('Nom mis à jour');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    Alert.alert('Supprimer votre compte ?', 'Votre nom et votre numéro seront effacés. Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/me', { method: 'DELETE' });
            await signOut();
          } catch (e) {
            Alert.alert('Suppression impossible', e instanceof ApiError ? e.message : 'Erreur');
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <View style={s.head}>
        <Avatar name={user?.name || '?'} id={user?.id ?? 0} size={72} />
        <Text style={s.name}>{user?.name}</Text>
        <Text style={s.phone}>{user ? displayPhone(user.phone) : ''}</Text>
      </View>

      {editing ? (
        <Card>
          <Field label="Nom affiché" value={name} onChangeText={setName} autoCapitalize="words" autoFocus />
          <ErrorBox message={error} />
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Button title="Annuler" variant="secondary" onPress={() => { setEditing(false); setName(user?.name ?? ''); }} style={{ flex: 1 }} />
            <Button title="Enregistrer" onPress={save} loading={saving} disabled={name.trim().length < 2 || name.trim() === user?.name} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      <Card style={s.list}>
        {!editing ? <Row icon="person-outline" label="Modifier mon nom" onPress={() => setEditing(true)} /> : null}
        {WA_BOT ? <Row icon="logo-whatsapp" label="Assistant iKobi sur WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${WA_BOT}?text=menu`)} /> : null}
        <Row icon="help-circle-outline" label="Centre d’aide" onPress={() => Linking.openURL('https://ikobi.app/aide')} />
        <Row icon="mail-outline" label="Contacter le support" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        <Row icon="document-text-outline" label="Confidentialité et conditions" onPress={() => router.push('/legal')} last />
      </Card>

      <Card style={s.list}>
        <Row icon="log-out-outline" label="Se déconnecter" onPress={() => Alert.alert('Se déconnecter ?', '', [{ text: 'Annuler', style: 'cancel' }, { text: 'Déconnexion', style: 'destructive', onPress: () => void signOut() }])} />
        <Row icon="trash-outline" label="Supprimer mon compte" danger onPress={remove} last />
      </Card>

      <Text style={s.version}>iKobi {Constants.expoConfig?.version ?? ''} · iKobi n’est ni une banque ni un établissement de paiement.</Text>
    </Screen>
  );
}

function Row({ icon, label, onPress, danger, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean; last?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.row, !last && s.rowBorder, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={20} color={danger ? C.red : C.muted} />
      <Text style={[s.rowLabel, danger && { color: C.red }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={C.faint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  head: { alignItems: 'center', gap: 6, paddingVertical: S.md },
  name: { color: C.text, fontFamily: F.displayX, fontSize: 24, marginTop: S.sm },
  phone: { color: C.muted, fontFamily: F.bodyM, fontSize: 15 },
  list: { paddingVertical: 0, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  rowLabel: { flex: 1, color: C.text, fontFamily: F.bodyM, fontSize: 16 },
  version: { color: C.faint, fontFamily: F.body, fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
