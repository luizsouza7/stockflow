// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseLifecycleBanner } from './DatabaseLifecycleBanner';

afterEach(cleanup);

describe('DatabaseLifecycleBanner', () => {
  it('orienta o usuário quando outra aba bloqueia a atualização', () => {
    render(
      <DatabaseLifecycleBanner
        state={{
          status: 'upgrade-blocked',
          message:
            'Uma atualização do armazenamento está aguardando o fechamento de outra aba do StockFlow. Feche ou recarregue as outras abas e tente novamente.',
        }}
        onReload={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('outra aba do StockFlow');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('oferece reload consciente quando a conexão antiga já foi fechada', () => {
    const onReload = vi.fn();
    render(
      <DatabaseLifecycleBanner
        state={{
          status: 'reload-required',
          message: 'A conexão antiga foi fechada.',
        }}
        onReload={onReload}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Recarregar agora' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('não cria aviso no estado normal', () => {
    render(<DatabaseLifecycleBanner state={{ status: 'normal' }} onReload={vi.fn()} />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
