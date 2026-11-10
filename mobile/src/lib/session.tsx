import * as SecureStoreNative from 'expo-secure-store';
import { Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setToken, setUnauthorizedHandler, type User } from './api';
import { registerForPush } from './push';

const KEY = 'ikobi.session';

// Stockage chiffré (Keychain / Keystore) sur mobile ; localStorage pour l'aperçu web.
const SecureStore =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
        setItemAsync: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
        deleteItemAsync: async (k: string) => globalThis.localStorage?.removeItem(k),
      }
    : SecureStoreNative;

type Session = {
  ready: boolean;
  user: User | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(async () => {
    setToken(null);
    setUser(null);
    await SecureStore.deleteItemAsync(KEY).catch(() => {});
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        if (raw) {
          const { token, user: u } = JSON.parse(raw) as { token: string; user: User };
          setToken(token);
          setUser(u);
          api<User>('/me').then(setUser).catch(() => {});
        }
      } finally {
        setReady(true);
      }
    })();
  }, [signOut]);

  useEffect(() => {
    if (user) void registerForPush();
  }, [user]);

  const signIn = useCallback(async (token: string, u: User) => {
    setToken(token);
    setUser(u);
    await SecureStore.setItemAsync(KEY, JSON.stringify({ token, user: u }));
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await api<User>('/me');
    setUser(u);
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) await SecureStore.setItemAsync(KEY, JSON.stringify({ ...JSON.parse(raw), user: u }));
  }, []);

  const value = useMemo(() => ({ ready, user, signIn, signOut, refreshUser }), [ready, user, signIn, signOut, refreshUser]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession hors SessionProvider');
  return v;
}
