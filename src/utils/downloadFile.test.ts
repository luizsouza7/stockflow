// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFile } from './downloadFile';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('download de arquivo local', () => {
  it('prepara o download e revoga a URL temporaria', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:stockflow-test');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadFile({
      content: '{}',
      fileName: 'stockflow-backup-2026-07-15.json',
      mimeType: 'application/json;charset=utf-8',
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stockflow-test');
  });
});

