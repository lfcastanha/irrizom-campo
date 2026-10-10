import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cliente: SupabaseClient | null = null;

/** Cria o cliente só no navegador (o build estático não tem as chaves). */
export function sb(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_KEY');
  }
  cliente = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'irrizom-auth' },
  });
  return cliente;
}
