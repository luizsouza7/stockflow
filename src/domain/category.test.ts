import { describe, expect, it } from 'vitest';
import {
  MAX_CATEGORY_NAME_LENGTH,
  normalizeCategoryNameForComparison,
  sanitizeCategoryName,
  validateCategoryName,
} from './category';

describe('regras de categoria', () => {
  it('remove espacos externos e consecutivos', () => {
    expect(sanitizeCategoryName('  Bebidas   Geladas  ')).toBe('Bebidas Geladas');
  });

  it('normaliza caixa apenas para comparacao', () => {
    expect(normalizeCategoryNameForComparison('  BEBIDAS  ')).toBe('bebidas');
  });

  it.each(['', '   '])('rejeita nome vazio: %j', (name) => {
    expect(() => validateCategoryName(name)).toThrow('Informe o nome da categoria.');
  });

  it('rejeita nome maior que o limite', () => {
    expect(() => validateCategoryName('a'.repeat(MAX_CATEGORY_NAME_LENGTH + 1))).toThrow(
      `O nome da categoria deve ter no maximo ${MAX_CATEGORY_NAME_LENGTH} caracteres.`,
    );
  });
});
