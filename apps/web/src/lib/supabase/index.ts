import { createClient } from '@supabase/supabase-js';
import { envConfig } from '@/env';
import { type Database } from './types';

export const supabase = createClient<Database>(
  envConfig.SUPABASE_URL,
  envConfig.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
