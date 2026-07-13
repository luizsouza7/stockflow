import { describe, expect, it } from 'vitest';
import type { LegacyMovement, TrackedMovement } from '../types/Movement';
import { calculateStockSnapshot, hasStockSnapshot } from './stockMovement';

describe('regras de snapshot de estoque', () => {
  it('calcula entrada usando o estoque atual como anterior', () => {
    expect(calculateStockSnapshot(10, 'entrada', 8)).toEqual({
      previousQuantity: 10,
      resultingQuantity: 18,
    });
  });

  it('calcula saida usando o estoque atual como anterior', () => {
    expect(calculateStockSnapshot(20, 'saida', 5)).toEqual({
      previousQuantity: 20,
      resultingQuantity: 15,
    });
  });

  it.each([0, -1, 1.5])('recusa quantidade invalida: %s', (quantity) => {
    expect(() => calculateStockSnapshot(10, 'entrada', quantity)).toThrow(
      'A quantidade deve ser um numero inteiro maior que zero.',
    );
  });

  it('recusa saida maior que o estoque', () => {
    expect(() => calculateStockSnapshot(10, 'saida', 15)).toThrow(
      'A saida nao pode ser maior que a quantidade disponivel.',
    );
  });

  it('distingue movimentacao rastreavel de registro legado', () => {
    const base = {
      productId: 1,
      type: 'entrada' as const,
      quantity: 2,
      note: '',
      date: '2026-07-12T00:00:00.000Z',
      syncStatus: 'pending' as const,
    };
    const tracked: TrackedMovement = {
      ...base,
      previousQuantity: 3,
      resultingQuantity: 5,
    };
    const legacy: LegacyMovement = { ...base, isLegacy: true };

    expect(hasStockSnapshot(tracked)).toBe(true);
    expect(hasStockSnapshot(legacy)).toBe(false);
  });
});
