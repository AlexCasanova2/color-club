import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const fetchWithTimeout: typeof globalThis.fetch = async (input, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try { return await globalThis.fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
};

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  key ?? 'placeholder',
  {
    global: { fetch: fetchWithTimeout },
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
