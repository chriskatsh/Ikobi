import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SessionProvider, useSession } from '@/lib/session';
import { C } from '@/theme';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.text, border: C.border, primary: C.gold },
};

function RootStack() {
  const { ready, user } = useSession();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: C.bg },
      }}>
      <Stack.Protected guard={!user} redirectTo="/">
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: '' }} />
        <Stack.Screen name="verify" options={{ title: '' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!user} redirectTo="/welcome">
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="create" options={{ title: 'Nouvelle tontine', presentation: 'modal' }} />
        <Stack.Screen name="join" options={{ title: 'Rejoindre', presentation: 'modal' }} />
        <Stack.Screen name="group/[id]" options={{ title: '' }} />
        <Stack.Screen name="pay/[id]" options={{ title: 'Cotiser', presentation: 'modal' }} />
        <Stack.Screen name="history/[id]" options={{ title: 'Historique' }} />
        <Stack.Screen name="profile" options={{ title: 'Mon profil' }} />
      </Stack.Protected>
      <Stack.Screen name="legal" options={{ title: 'Confidentialité & conditions' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <SessionProvider>
        <StatusBar style="light" />
        <RootStack />
      </SessionProvider>
    </ThemeProvider>
  );
}
