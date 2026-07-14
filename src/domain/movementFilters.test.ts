import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOVEMENT_FILTERS,
  filterAndSortMovements,
  getMovementProductOptions,
  type MovementFilters,
} from './movementFilters';
import type { MovementWithProduct } from '../types/Movement';

const coffeeId = '11111111-1111-4111-8111-111111111111';
const riceId = '22222222-2222-4222-8222-222222222222';

describe('filtros e ordenacao de movimentacoes', () => {
  const movements = [
    movement('Entrada cafe', coffeeId, 'entrada', localIso(2026, 7, 14, 8)),
    movement('Saida cafe', coffeeId, 'saida', localIso(2026, 7, 14, 23, 59, 59)),
    movement('Entrada arroz', riceId, 'entrada', localIso(2026, 7, 10, 12)),
    movement('Legada arroz', riceId, 'saida', localIso(2026, 6, 30, 12), true),
  ];

  it('filtra por UUID do produto', () => {
    expect(run(movements, { productId: coffeeId }).movements.map(note)).toEqual([
      'Saida cafe',
      'Entrada cafe',
    ]);
  });

  it.each([
    ['entrada', ['Entrada cafe', 'Entrada arroz']],
    ['saida', ['Saida cafe', 'Legada arroz']],
  ] as const)('filtra por tipo %s', (type, expectedNotes) => {
    expect(run(movements, { type }).movements.map(note)).toEqual(expectedNotes);
  });

  it('aplica somente a data inicial', () => {
    expect(run(movements, { startDate: '2026-07-14' }).movements.map(note)).toEqual([
      'Saida cafe',
      'Entrada cafe',
    ]);
  });

  it('aplica somente a data final e inclui o dia inteiro', () => {
    expect(run(movements, { endDate: '2026-07-14' }).movements.map(note)).toEqual([
      'Saida cafe',
      'Entrada cafe',
      'Entrada arroz',
      'Legada arroz',
    ]);
  });

  it('aplica intervalo completo inclusivo', () => {
    expect(
      run(movements, { startDate: '2026-07-10', endDate: '2026-07-14' }).movements.map(note),
    ).toEqual(['Saida cafe', 'Entrada cafe', 'Entrada arroz']);
  });

  it('rejeita intervalo invertido sem produzir resultado', () => {
    expect(run(movements, { startDate: '2026-07-15', endDate: '2026-07-14' })).toEqual({
      movements: [],
      validationError: 'A data inicial nao pode ser posterior a data final.',
    });
  });

  it('ordena das mais recentes para as mais antigas e no sentido inverso', () => {
    expect(run(movements, { sort: 'newest' }).movements.map(note)).toEqual([
      'Saida cafe',
      'Entrada cafe',
      'Entrada arroz',
      'Legada arroz',
    ]);
    expect(run(movements, { sort: 'oldest' }).movements.map(note)).toEqual([
      'Legada arroz',
      'Entrada arroz',
      'Entrada cafe',
      'Saida cafe',
    ]);
  });

  it('combina produto, tipo e periodo', () => {
    expect(
      run(movements, {
        productId: coffeeId,
        type: 'saida',
        startDate: '2026-07-01',
        endDate: '2026-07-14',
      }).movements.map(note),
    ).toEqual(['Saida cafe']);
  });

  it('preserva movimento legado e snapshots durante filtros e ordenacao', () => {
    const result = run(movements, { sort: 'oldest' }).movements;
    expect(result[0]).toMatchObject({ note: 'Legada arroz', isLegacy: true });
    expect(result.find((item) => item.note === 'Entrada cafe')).toMatchObject({
      previousQuantity: 1,
      resultingQuantity: 2,
      isLegacy: false,
    });
  });

  it('monta opcoes unicas a partir do historico, inclusive produto removido', () => {
    const removed = movement(
      'Historico removido',
      crypto.randomUUID(),
      'entrada',
      localIso(2026, 7, 1, 10),
    );
    removed.productName = 'Produto removido';
    removed.productCode = '-';

    expect(getMovementProductOptions([...movements, removed])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: removed.productId, name: 'Produto removido' }),
        expect.objectContaining({ id: coffeeId, name: 'Cafe' }),
      ]),
    );
  });
});

function run(movements: MovementWithProduct[], changes: Partial<MovementFilters>) {
  return filterAndSortMovements(movements, { ...DEFAULT_MOVEMENT_FILTERS, ...changes });
}

function note(movement: MovementWithProduct) {
  return movement.note;
}

function localIso(year: number, month: number, day: number, hour: number, minute = 0, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second).toISOString();
}

function movement(
  noteText: string,
  productId: string,
  type: 'entrada' | 'saida',
  date: string,
  isLegacy = false,
): MovementWithProduct {
  const common = {
    id: crypto.randomUUID(),
    productId,
    productName: productId === coffeeId ? 'Cafe' : 'Arroz',
    productCode: productId === coffeeId ? 'CAFE' : 'ARROZ',
    type,
    quantity: 1,
    note: noteText,
    date,
    syncStatus: 'pending' as const,
  };

  return isLegacy
    ? { ...common, isLegacy: true }
    : { ...common, isLegacy: false, previousQuantity: 1, resultingQuantity: 2 };
}
