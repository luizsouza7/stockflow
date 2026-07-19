import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import {
  createAuthService,
  getAuthErrorMessage,
  type AuthApi,
} from './authService';

const session = createSession('usuario@stockflow.test');

describe('authService', () => {
  it('recusa operacoes quando Supabase nao esta configurado', async () => {
    const service = createAuthService(undefined, 'Configuracao ausente.');

    expect(service.isConfigured()).toBe(false);
    expect(service.getConfigurationMessage()).toBe('Configuracao ausente.');
    await expect(service.getSession()).rejects.toThrow('Configuracao ausente.');
  });

  it('carrega sessao inicial pelo cliente oficial', async () => {
    const api = createAuthApi();
    api.getSession.mockResolvedValue({ data: { session }, error: null });

    await expect(createAuthService(api).getSession()).resolves.toBe(session);
    expect(api.getSession).toHaveBeenCalledTimes(1);
  });

  it('encaminha login, cadastro e logout sem armazenar senha localmente', async () => {
    const api = createAuthApi();
    const service = createAuthService(api);

    await service.signIn('pessoa@teste.com', 'senha-segura');
    await service.signUp('nova@teste.com', 'outra-senha');
    await service.signOut();

    expect(api.signInWithPassword).toHaveBeenCalledWith({
      email: 'pessoa@teste.com',
      password: 'senha-segura',
    });
    expect(api.signUp).toHaveBeenCalledWith({
      email: 'nova@teste.com',
      password: 'outra-senha',
    });
    expect(api.signOut).toHaveBeenCalledTimes(1);
  });

  it('registra listener e executa cleanup fornecido pelo cliente', () => {
    const api = createAuthApi();
    const cleanup = vi.fn();
    api.onAuthStateChange.mockReturnValue(cleanup);
    const listener = vi.fn();

    const unsubscribe = createAuthService(api).subscribe(listener);
    unsubscribe();

    expect(api.onAuthStateChange).toHaveBeenCalledWith(listener);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('fornece mensagens amigaveis sem detalhes tecnicos', () => {
    expect(getAuthErrorMessage('sign-in')).toBe(
      'Nao foi possivel entrar. Verifique e-mail, senha e conexao.',
    );
    expect(getAuthErrorMessage('sign-up')).not.toContain('Supabase');
    expect(getAuthErrorMessage('sign-out')).not.toContain('token');
  });
});

function createAuthApi() {
  return {
    getSession: vi.fn<AuthApi['getSession']>().mockResolvedValue({
      data: { session: null },
      error: null,
    }),
    signInWithPassword: vi.fn<AuthApi['signInWithPassword']>().mockResolvedValue({
      data: { session: null },
      error: null,
    }),
    signUp: vi.fn<AuthApi['signUp']>().mockResolvedValue({
      data: { session: null },
      error: null,
    }),
    signOut: vi.fn<AuthApi['signOut']>().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn<AuthApi['onAuthStateChange']>().mockReturnValue(() => undefined),
  };
}

function createSession(email: string): Session {
  return {
    access_token: 'token-publico-de-teste',
    refresh_token: 'refresh-publico-de-teste',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      email,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-07-17T00:00:00.000Z',
    },
  };
}
