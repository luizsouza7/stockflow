// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import {
  ActiveDataScopeProvider,
  useActiveDataScope,
} from './useActiveDataScope';
import type {
  BusinessContextService,
  PersistedBusinessContext,
} from '../services/businessContextService';

const auth = vi.hoisted(() => ({
  state: { status: 'unauthenticated' } as
    | { status: 'unauthenticated' }
    | { status: 'authenticated'; session: Session },
}));

vi.mock('./useAuthSession', () => ({
  useAuthSession: () => auth.state,
}));

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const BUSINESS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BUSINESS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

afterEach(() => {
  cleanup();
  auth.state = { status: 'unauthenticated' };
});

describe('fonte unica do escopo ativo', () => {
  it('usa modo local sem usuario ou business selecionado', () => {
    const contextService = createContextService();
    renderScope(contextService);

    expect(screen.getByTestId('kind').textContent).toBe('local');
    expect(screen.getByTestId('label').textContent).toBe('Dados locais deste dispositivo');
    expect(contextService.listAvailable).not.toHaveBeenCalled();
    expect(contextService.validateMembership).not.toHaveBeenCalled();
  });

  it('recupera offline business persistido com nome amigavel sem rede', () => {
    auth.state = authenticated(USER_A);
    const contextService = createContextService({
      userId: USER_A,
      id: BUSINESS_A,
      name: 'Loja Central',
    });
    renderScope(contextService);

    expect(screen.getByTestId('kind').textContent).toBe('business');
    expect(screen.getByTestId('token').textContent).toContain(BUSINESS_A);
    expect(screen.getByTestId('label').textContent).toBe('Estabelecimento: Loja Central');
    expect(screen.getByTestId('label').textContent).not.toContain(BUSINESS_A);
    expect(contextService.listAvailable).not.toHaveBeenCalled();
    expect(contextService.validateMembership).not.toHaveBeenCalled();
  });

  it('atualiza ao trocar business persistido', () => {
    auth.state = authenticated(USER_A);
    let selected: PersistedBusinessContext | undefined = {
      userId: USER_A,
      id: BUSINESS_A,
      name: 'Loja A',
    };
    let listener: () => void = () => undefined;
    const contextService = createContextService();
    contextService.getSelectedContext = () => selected;
    contextService.getSelected = () => selected?.id;
    contextService.subscribe = (nextListener) => {
      listener = nextListener;
      return () => undefined;
    };
    renderScope(contextService);

    selected = { userId: USER_A, id: BUSINESS_B, name: 'Loja B' };
    act(() => listener());

    expect(screen.getByTestId('label').textContent).toBe('Estabelecimento: Loja B');
    expect(screen.getByTestId('token').textContent).toContain(BUSINESS_B);
  });

  it('logout e troca de usuario nao reutilizam business do usuario anterior', () => {
    auth.state = authenticated(USER_A);
    const selected = {
      userId: USER_A,
      id: BUSINESS_A,
      name: 'Loja A',
    };
    const contextService = createContextService(selected);
    const view = renderScope(contextService);
    expect(screen.getByTestId('kind').textContent).toBe('business');

    auth.state = { status: 'unauthenticated' };
    view.rerender(tree(contextService));
    expect(screen.getByTestId('kind').textContent).toBe('local');

    auth.state = authenticated(USER_B);
    view.rerender(tree(contextService));
    expect(screen.getByTestId('kind').textContent).toBe('local');
  });
});

function renderScope(contextService: BusinessContextService) {
  return render(tree(contextService));
}

function tree(contextService: BusinessContextService) {
  return (
    <ActiveDataScopeProvider contextService={contextService}>
      <ScopeProbe />
    </ActiveDataScopeProvider>
  );
}

function ScopeProbe() {
  const active = useActiveDataScope();
  return (
    <>
      <span data-testid="kind">{active.scope.kind}</span>
      <span data-testid="token">{active.scopeToken}</span>
      <span data-testid="label">{active.label}</span>
    </>
  );
}

function authenticated(userId: string): { status: 'authenticated'; session: Session } {
  return {
    status: 'authenticated',
    session: {
      user: { id: userId },
    } as Session,
  };
}

function createContextService(
  selected?: PersistedBusinessContext,
): BusinessContextService {
  return {
    isConfigured: () => true,
    listAvailable: vi.fn(async () => []),
    validateMembership: vi.fn(async () => false),
    select: vi.fn(async () => undefined),
    getSelected: (userId) => (selected?.userId === userId ? selected.id : undefined),
    getSelectedContext: (userId) => (selected?.userId === userId ? selected : undefined),
    clearSelected: vi.fn(),
    subscribe: () => () => undefined,
  };
}
