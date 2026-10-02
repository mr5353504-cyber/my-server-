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
    return '';
  },
  TELEGRAM_CHANNEL_ID: '-1004408587176',
  SUPABASE_URL: 'https://tmomuyxckjhlsjfbzfvz.supabase.co',
};
