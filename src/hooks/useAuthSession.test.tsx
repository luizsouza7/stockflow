// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { AuthService } from '../services/authService';
import { useAuthSession } from './useAuthSession';

afterEach(cleanup);

describe('useAuthSession', () => {
  it('inicia carregando enquanto consulta a sessao', () => {
    const service = createService();
    service.getSession.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useAuthSession(service));

    expect(result.current).toEqual({ status: 'loading' });
  });

  it('representa sessao ausente', async () => {
    const service = createService();
    const { result } = renderHook(() => useAuthSession(service));

    await waitFor(() => expect(result.current).toEqual({ status: 'unauthenticated' }));
  });

  it('representa sessao presente', async () => {
    const authenticatedSession = createSession('conectado@stockflow.test');
    const service = createService(authenticatedSession);
    const { result } = renderHook(() => useAuthSession(service));

    await waitFor(() => expect(result.current).toEqual({
      status: 'authenticated',
      session: authenticatedSession,
    }));
  });

  it('atualiza pelo listener e nao deixa a leitura inicial obsoleta sobrescrever o evento', async () => {
    let resolveInitialSession: ((session: Session | null) => void) | undefined;
    let authListener: ((session: Session | null) => void) | undefined;
    const service = createService();
    service.getSession.mockReturnValue(
      new Promise((resolve) => {
        resolveInitialSession = resolve;
      }),
    );
    service.subscribe.mockImplementation((listener) => {
      authListener = listener;
      return vi.fn();
    });
    const listenerSession = createSession('evento@stockflow.test');
    const { result } = renderHook(() => useAuthSession(service));

    act(() => authListener?.(listenerSession));
    resolveInitialSession?.(null);

    await waitFor(() => expect(result.current).toEqual({
      status: 'authenticated',
      session: listenerSession,
    }));
  });

  it('remove listener no cleanup', () => {
    const cleanupListener = vi.fn();
    const service = createService();
    service.subscribe.mockReturnValue(cleanupListener);

    const { unmount } = renderHook(() => useAuthSession(service));
    unmount();

    expect(cleanupListener).toHaveBeenCalledTimes(1);
  });

  it('mostra configuracao ausente sem consultar rede ou registrar listener', () => {
    const service = createService();
    service.isConfigured.mockReturnValue(false);
    service.getConfigurationMessage.mockReturnValue('Supabase nao configurado para teste.');

    const { result } = renderHook(() => useAuthSession(service));

    expect(result.current).toEqual({
      status: 'unconfigured',
      message: 'Supabase nao configurado para teste.',
    });
    expect(service.getSession).not.toHaveBeenCalled();
    expect(service.subscribe).not.toHaveBeenCalled();
  });
});

function createService(initialSession: Session | null = null) {
  return {
    isConfigured: vi.fn<AuthService['isConfigured']>().mockReturnValue(true),
    getConfigurationMessage: vi.fn<AuthService['getConfigurationMessage']>(),
    getSession: vi.fn<AuthService['getSession']>().mockResolvedValue(initialSession),
    signIn: vi.fn<AuthService['signIn']>().mockResolvedValue(undefined),
    signUp: vi.fn<AuthService['signUp']>().mockResolvedValue(undefined),
    signOut: vi.fn<AuthService['signOut']>().mockResolvedValue(undefined),
    subscribe: vi.fn<AuthService['subscribe']>().mockReturnValue(() => undefined),
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
