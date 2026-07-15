// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from './OfflineBanner';
import { PwaUpdateBanner } from './PwaUpdateBanner';

afterEach(cleanup);

describe('avisos de conectividade e atualizacao', () => {
  it('informa o armazenamento local sem prometer sincronizacao', () => {
    render(<OfflineBanner isOnline={false} />);

    const message = screen.getByText(/Sem conexão/).textContent ?? '';
    expect(message).toContain('dados armazenados neste dispositivo');
    expect(message.toLowerCase()).not.toContain('sincron');
    expect(message.toLowerCase()).not.toContain('nuvem');
  });

  it('nao exibe aviso offline quando o navegador esta online', () => {
    render(<OfflineBanner isOnline />);

    expect(screen.queryByText(/Sem conexão/)).toBeNull();
  });

  it('oferece atualizacao consciente sem bloquear a aplicacao', () => {
    const onUpdate = vi.fn();
    render(<PwaUpdateBanner isVisible onUpdate={onUpdate} />);

    expect(screen.getByText('Nova versão disponível.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }));
    expect(onUpdate).toHaveBeenCalledOnce();
  });
});
