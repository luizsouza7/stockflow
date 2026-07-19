import { describe, expect, it } from 'vitest';
import {
  createSupabaseConnection,
  resolveSupabaseConfiguration,
  SUPABASE_ANON_KEY_ENV_NAME,
  SUPABASE_URL_ENV_NAME,
} from './supabase';

describe('configuracao do Supabase', () => {
  it('identifica ambiente sem configuracao sem criar cliente', () => {
    expect(createSupabaseConnection({})).toEqual({
      configuration: {
        status: 'missing',
        message: 'Supabase ainda nao esta configurado neste ambiente.',
      },
    });
  });

  it.each([
    [{ VITE_SUPABASE_URL: 'https://projeto.supabase.co' }],
    [{ VITE_SUPABASE_ANON_KEY: 'chave-publica-de-teste' }],
  ])('rejeita configuracao incompleta', (environment) => {
    expect(resolveSupabaseConfiguration(environment).status).toBe('incomplete');
  });

  it('aceita URL HTTPS e chave publica sem fazer chamada de rede', () => {
    const connection = createSupabaseConnection({
      VITE_SUPABASE_URL: 'https://projeto-teste.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'chave-publica-de-teste',
    });

    expect(connection.configuration.status).toBe('configured');
    expect(connection.client).toBeDefined();
  });

  it.each([
    'sb_secret_exemplo-invalido',
    `cabecalho.${btoa(JSON.stringify({ role: 'service_role' }))}.assinatura`,
    'valor-service_role-invalido',
  ])('rejeita chave administrativa no frontend', (anonKey) => {
    expect(
      resolveSupabaseConfiguration({
        VITE_SUPABASE_URL: 'https://projeto-teste.supabase.co',
        VITE_SUPABASE_ANON_KEY: anonKey,
      }).status,
    ).toBe('invalid');
  });

  it('expoe somente os nomes publicos esperados para configuracao Vite', () => {
    expect(SUPABASE_URL_ENV_NAME).toBe('VITE_SUPABASE_URL');
    expect(SUPABASE_ANON_KEY_ENV_NAME).toBe('VITE_SUPABASE_ANON_KEY');
  });
});
