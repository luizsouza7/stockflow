// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOnlineStatus } from './useOnlineStatus';

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useOnlineStatus', () => {
  it('usa o estado inicial online percebido pelo navegador', () => {
    setNavigatorOnline(true);

    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(true);
  });

  it('usa o estado inicial offline percebido pelo navegador', () => {
    setNavigatorOnline(false);

    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(false);
  });

  it('reage aos eventos offline e online', () => {
    setNavigatorOnline(true);
    const { result } = renderHook(() => useOnlineStatus());

    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current).toBe(false);

    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current).toBe(true);
  });

  it('remove os listeners quando desmontado', () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useOnlineStatus());

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('nao duplica listeners durante rerender', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const { rerender } = renderHook(() => useOnlineStatus());

    rerender();
    rerender();

    expect(addEventListener.mock.calls.filter(([event]) => event === 'online')).toHaveLength(1);
    expect(addEventListener.mock.calls.filter(([event]) => event === 'offline')).toHaveLength(1);
  });
});
