import { describe, expect, it } from 'vitest';
import {
  normalizeProductCodeForComparison,
  sanitizeProductCode,
} from './productCode';

describe('semantica do codigo interno do produto', () => {
  it('remove somente espacos externos do valor persistido', () => {
    expect(sanitizeProductCode('  AbC 123  ')).toBe('AbC 123');
  });

  it('normaliza trim e caixa apenas para comparacao', () => {
    expect(normalizeProductCodeForComparison('  AbC123 ')).toBe('abc123');
    expect(sanitizeProductCode('  AbC123 ')).toBe('AbC123');
  });

  it('representa ausencia de codigo como string vazia', () => {
    expect(sanitizeProductCode('   ')).toBe('');
    expect(normalizeProductCodeForComparison('')).toBe('');
  });
});
