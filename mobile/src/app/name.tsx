import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { ActionBar, Button, ErrorBox, Field, H1, Muted, Screen } from '@/ui';
import { S } from '@/theme';

// Premier lancement : le nom est demandé une seule fois, aux nouveaux comptes.
export default function Name() {
  const { refreshUser } = useSession();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length >= 2;

  async function save() {
    setLoading(true);
    setError(null);
    try {
      await api('/me', { method: 'PATCH', body: { name: name.trim() } });
      await refreshUser();
      router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen footer={<ActionBar><Button title="Continuer" onPress={save} loading={loading} disabled={!valid} /></ActionBar>}>
      <View style={{ gap: S.sm, marginTop: S.sm }}>
        <H1>Comment vous appelle-t-on ?</H1>
        <Muted>Les membres de vos tontines verront ce nom à côté de vos paiements.</Muted>
      </View>
      <Field label="Prénom et nom" placeholder="Ex. Aline Mbuyi" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" autoComplete="name" autoFocus onSubmitEditing={() => valid && save()} />
      <ErrorBox message={error} />
    </Screen>
  );
}
