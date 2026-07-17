import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL_ENV_NAME = 'VITE_SUPABASE_URL';
export const SUPABASE_ANON_KEY_ENV_NAME = 'VITE_SUPABASE_ANON_KEY';

interface SupabaseEnvironment {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export type SupabaseConfiguration =
  | { status: 'configured'; url: string; anonKey: string }
  | { status: 'missing' | 'incomplete' | 'invalid'; message: string };

export interface SupabaseConnection {
  configuration: SupabaseConfiguration;
  client?: SupabaseClient;
}

export function resolveSupabaseConfiguration(
  environment: SupabaseEnvironment,
): SupabaseConfiguration {
  const url = environment.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = environment.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

  if (!url && !anonKey) {
    return {
      status: 'missing',
      message: 'Supabase ainda nao esta configurado neste ambiente.',
    };
  }

  if (!url || !anonKey) {
    return {
      status: 'incomplete',
      message: 'A configuracao do Supabase esta incompleta neste ambiente.',
    };
  }

  if (!isAllowedSupabaseUrl(url) || isPlaceholder(url) || isPlaceholder(anonKey)) {
    return {
      status: 'invalid',
      message: 'A configuracao do Supabase e invalida neste ambiente.',
    };
  }

  if (isPrivilegedKey(anonKey)) {
    return {
      status: 'invalid',
      message: 'Uma chave administrativa nao pode ser usada no frontend.',
    };
  }

  return { status: 'configured', url, anonKey };
}

export function createSupabaseConnection(
  environment: SupabaseEnvironment,
): SupabaseConnection {
  const configuration = resolveSupabaseConfiguration(environment);

  if (configuration.status !== 'configured') {
    return { configuration };
  }

  return {
    configuration,
    client: createClient(configuration.url, configuration.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  };
}

function isAllowedSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

function isPlaceholder(value: string): boolean {
  const normalized = value.toLocaleLowerCase('en-US');
  return (
    normalized.includes('seu-projeto') ||
    normalized.includes('sua-chave') ||
    normalized.includes('your-project') ||
    normalized.includes('your-key')
  );
}

function isPrivilegedKey(value: string): boolean {
  const normalized = value.toLocaleLowerCase('en-US');

  if (normalized.startsWith('sb_secret_') || normalized.includes('service_role')) {
    return true;
  }

  const parts = value.split('.');
  if (parts.length !== 3) return false;

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as unknown;
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'role' in payload &&
      (payload as { role?: unknown }).role === 'service_role'
    );
  } catch {
    return false;
  }
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return atob(padded);
}

export const supabaseConnection = createSupabaseConnection({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
