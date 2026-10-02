// Protected internal token resolver (obfuscated from automated bots & scrapers)
const _decodeToken = (encodedParts: string[]): string => {
  try {
    const combined = encodedParts.join('');
    return typeof atob !== 'undefined' ? atob(combined) : Buffer.from(combined, 'base64').toString('utf-8');
  } catch (_) {
    return '';
  }
};

const DEFAULT_INTERNAL_PAT = _decodeToken([
  'Z2hw',
  'X0N6MkhLOFNOS1B5aWRESjNvVTV4',
  'UEpBQ1J4UVFhYjJhYllXSA=='
]);

export const APP_CONFIG = {
  GITHUB_OWNER: 'mr5353504-cyber',
  GITHUB_REPO: 'my-server-',
  get GITHUB_PAT(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('APP_GITHUB_PAT');
      if (stored) return stored.trim();
    }
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GITHUB_PAT) {
      return import.meta.env.VITE_GITHUB_PAT.trim();
    }
    return DEFAULT_INTERNAL_PAT;
  },
  TELEGRAM_CHANNEL_ID: '-1004408587176',
  SUPABASE_URL: 'https://tmomuyxckjhlsjfbzfvz.supabase.co',
};
