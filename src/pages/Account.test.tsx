// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { AuthService } from '../services/authService';
import { Account } from './Account';

const onlineStatus = vi.hoisted(() => ({ value: true }));
vi.mock('../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => onlineStatus.value }));

beforeEach(() => {
  onlineStatus.value = true;
});

afterEach(cleanup);

describe('pagina Conta', () => {
  it('app continua utilizavel sem Supabase e explica o escopo local', () => {
    const service = createService();
    service.isConfigured.mockReturnValue(false);
    service.getConfigurationMessage.mockReturnValue(
      'Supabase ainda nao esta configurado neste ambiente.',
    );

    render(<Account service={service} />);

    expect(screen.getByRole('status').textContent).toContain('Supabase ainda nao esta configurado');
    expect(screen.getByText(/controle local de estoque/i)).toBeTruthy();
    expect(screen.getByText(/nao sao enviados ou sincronizados automaticamente/i)).toBeTruthy();
  });

  it('login chama o service e evita double-submit', async () => {
    let resolveLogin: (() => void) | undefined;
    const service = createService();
    service.signIn.mockReturnValue(new Promise((resolve) => (resolveLogin = resolve)));
    render(<Account service={service} />);
    await waitFor(() => screen.getByRole('button', { name: 'Entrar' }));

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' pessoa@teste.com ' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura' } });
    const submit = screen.getByRole('button', { name: 'Entrar' });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);

    expect(service.signIn).toHaveBeenCalledTimes(1);
    expect(service.signIn).toHaveBeenCalledWith('pessoa@teste.com', 'senha-segura');
    expect(screen.getByRole('button', { name: 'Entrando...' })).toBeTruthy();
    resolveLogin?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy());
  });

  it('cadastro chama o service correto', async () => {
    const service = createService();
    render(<Account service={service} />);
    await waitFor(() => screen.getByRole('button', { name: 'Quero criar conta' }));

    fireEvent.click(screen.getByRole('button', { name: 'Quero criar conta' }));
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'nova@teste.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => expect(service.signUp).toHaveBeenCalledWith('nova@teste.com', 'senha-nova'));
    expect(screen.getByRole('status').textContent).toContain('Conta criada');
  });

  it('sessao presente mostra usuario e logout chama o service', async () => {
    const service = createService(createSession('conectado@stockflow.test'));
    render(<Account service={service} />);

    await waitFor(() => expect(screen.getByText(/conectado@stockflow.test/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));

    await waitFor(() => expect(service.signOut).toHaveBeenCalledTimes(1));
  });

  it('erro tecnico de Auth vira mensagem amigavel', async () => {
    const service = createService();
    service.signIn.mockRejectedValue(new Error('AuthApiError: invalid_grant token=segredo'));
    render(<Account service={service} />);
    await waitFor(() => screen.getByRole('button', { name: 'Entrar' }));

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'pessoa@teste.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(
      'Nao foi possivel entrar. Verifique e-mail, senha e conexao.',
    ));
    expect(screen.queryByText(/invalid_grant|segredo/)).toBeNull();
  });

  it('offline impede novo login sem bloquear recursos locais', async () => {
    onlineStatus.value = false;
    const service = createService();
    render(<Account service={service} />);
    await waitFor(() => screen.getByText(/controle local de estoque/i));

    expect((screen.getByRole('button', { name: 'Entrar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/novos acessos exigem conexao/i)).toBeTruthy();
    expect(service.signIn).not.toHaveBeenCalled();
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
