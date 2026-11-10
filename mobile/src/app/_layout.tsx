import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SessionProvider, useSession } from '@/lib/session';
import { C, F } from '@/theme';
import { ToastProvider } from '@/ui';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.text, border: C.border, primary: C.gold },
};

function RootStack() {
  const { ready: sessionReady, user } = useSession();
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold,
    InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold,
  });
  const ready = sessionReady && (fontsLoaded || Boolean(fontError));

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        headerTitleStyle: { fontFamily: F.display, fontSize: 17 },
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
        <Stack.Screen name="name" options={{ title: '', headerBackVisible: false, gestureEnabled: false }} />
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
        <ToastProvider>
          <StatusBar style="light" />
          <RootStack />
        </ToastProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
