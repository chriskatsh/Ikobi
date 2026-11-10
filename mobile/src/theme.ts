// Identité visuelle Ikobi : nuit profonde, or de la cagnotte, vert de la confiance.
export const C = {
  bg: '#090C15',
  surface: '#121726',
  surface2: '#1A2133',
  border: '#262F45',
  text: '#F4F6FB',
  muted: '#9AA3B8',
  faint: '#5F6880',
  gold: '#F5C451',
  goldDim: '#3A3220',
  green: '#2BD9A0',
  greenDim: '#123A30',
  red: '#FF6B6B',
  redDim: '#3A1E22',
  blue: '#6CA8FF',
} as const;

export const R = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const OPERATORS: Record<string, { label: string; color: string }> = {
  mpesa: { label: 'M-Pesa', color: '#E60000' },
  orange: { label: 'Orange Money', color: '#FF7900' },
  airtel: { label: 'Airtel Money', color: '#ED1C24' },
  africell: { label: 'Afrimoney', color: '#7B2CBF' },
};
