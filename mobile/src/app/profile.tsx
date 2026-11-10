import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { displayPhone } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Field, H2, Muted, Screen } from '@/ui';

const WA_BOT = process.env.EXPO_PUBLIC_WHATSAPP_NUMBER || '';
const SUPPORT_EMAIL = 'support@ikobi.app';

export default function Profile() {
  const { user, signOut, refreshUser } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api('/me', { method: 'PATCH', body: { name: name.trim() } });
      await refreshUser();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Field label="Nom affiché" value={name} onChangeText={setName} autoCapitalize="words" />
        <Muted>Téléphone : {user ? displayPhone(user.phone) : ''}</Muted>
        <ErrorBox message={error} />
        <Button title="Enregistrer" variant="secondary" onPress={save} loading={saving} disabled={name.trim().length < 2 || name.trim() === user?.name} />
      </Card>

      {WA_BOT ? (
        <Card>
          <H2>Ikobi sur WhatsApp</H2>
          <Muted>Cotise, consulte tes tontines et reçois tes rappels directement dans WhatsApp.</Muted>
          <Button title="Ouvrir le chat Ikobi" variant="whatsapp" onPress={() => Linking.openURL(`https://wa.me/${WA_BOT}?text=menu`)} />
        </Card>
      ) : null}

      <Card>
        <H2>Aide</H2>
        <Button title="Contacter le support" variant="secondary" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        <Button title="Confidentialité & conditions" variant="ghost" onPress={() => router.push('/legal')} />
      </Card>

      <Button
        title="Se déconnecter"
        variant="danger"
        onPress={() =>
          Alert.alert('Se déconnecter ?', '', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Déconnexion', style: 'destructive', onPress: () => void signOut() },
          ])
        }
      />
      <Button
        title="Supprimer mon compte"
        variant="ghost"
        onPress={() =>
          Alert.alert('Supprimer ton compte ?', 'Ton nom et ton numéro seront effacés. Cette action est définitive.', [
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
          ])
        }
      />
    </Screen>
  );
}
