import Constants from 'expo-constants';

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  'https://api.ikobi.app';

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null) {
  token = t;
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Pas de connexion internet. Vérifie ton réseau et réessaie.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, data?.error?.code || 'error', data?.error?.message || 'Une erreur est survenue.');
  }
  return data as T;
}

// --- Types renvoyés par l'API
export type User = { id: number; phone: string; name: string };

export type GroupSummary = {
  id: number;
  name: string;
  amount: number;
  currency: string;
  frequency: string;
  status: 'forming' | 'active' | 'completed';
  role: 'admin' | 'member';
  members: number;
  maxMembers: number;
  pot: number;
  currentCycle: null | {
    number: number;
    dueDate: string;
    iAmBeneficiary: boolean;
    iHavePaid: boolean;
    paidCount: number;
    expectedCount: number;
  };
};

export type GroupDetail = {
  id: number;
  name: string;
  description: string;
  amount: number;
  currency: string;
  frequency: string;
  maxMembers: number;
  startDate: string;
  status: 'forming' | 'active' | 'completed';
  inviteCode: string;
  myRole: 'admin' | 'member';
  pot: number;
  members: { id: number; name: string; phoneEnd: string; role: string; position: number; paidCurrent: boolean | null }[];
  currentCycle: null | {
    number: number;
    dueDate: string;
    status: 'open' | 'ready' | 'paying_out';
    beneficiaryId: number;
    paidCount: number;
    expectedCount: number;
    iAmBeneficiary: boolean;
    iHavePaid: boolean;
    myPendingContributionId: number | null;
  };
  cycles: { number: number; dueDate: string; beneficiaryId: number; status: string }[];
  totalCycles: number;
};

export type Contribution = {
  id: number;
  status: 'pending' | 'success' | 'failed';
  amount: number;
  currency: string;
  method: string;
  reference: string;
  failureReason: string | null;
};

export type History = {
  contributions: { id: number; name: string; amount: number; currency: string; method: string; channel: string; cycle: number; at: string }[];
  payouts: { id: number; name: string; amount: number; currency: string; status: string; cycle: number; at: string }[];
};
