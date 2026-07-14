import { describe, expect, it } from 'vitest';
import { formatCentsForInput, formatCentsToBRL, parseCurrencyToCents } from './formatters';

describe('formatadores monetarios', () => {
  it.each([
    ['19,90', 1990],
    ['19.90', 1990],
    ['0', 0],
    ['0,00', 0],
  ])('converte %s para %i centavos', (input, expected) => {
    expect(parseCurrencyToCents(input)).toBe(expected);
  });

  it('formata centavos como real brasileiro', () => {
    expect(formatCentsToBRL(1990)).toBe('R$ 19,90');
  });

  it('prepara o valor persistido para edicao sem multiplicar novamente', () => {
    const inputValue = formatCentsForInput(1990);

    expect(inputValue).toBe('19,90');
    expect(parseCurrencyToCents(inputValue)).toBe(1990);
  });

  it.each(['', 'abc', '19,999', '19.90.1', 'NaN', 'Infinity', '-1', '999999999999999']) (
    'rejeita entrada invalida: %s',
    (input) => {
      expect(() => parseCurrencyToCents(input)).toThrow();
    },
  );

  it.each([-1, 19.9, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejeita centavos inconsistentes: %s',
    (value) => {
      expect(() => formatCentsToBRL(value)).toThrow();
    },
  );
});
