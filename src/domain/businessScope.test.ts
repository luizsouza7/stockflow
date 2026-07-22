import { describe, expect, it } from 'vitest';
import {
  assertSameBusinessScope,
  hasSameBusinessScope,
  isEntityInBusiness,
  isUnscopedEntity,
  validateBusinessId,
  validateOptionalBusinessId,
} from './businessScope';

const BUSINESS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BUSINESS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('escopo local por estabelecimento', () => {
  it('identifica entidades unscoped como legado local', () => {
    expect(isUnscopedEntity({})).toBe(true);
    expect(isUnscopedEntity({ businessId: BUSINESS_A })).toBe(false);
  });

  it('identifica entidade de um business especifico', () => {
    expect(isEntityInBusiness({ businessId: BUSINESS_A }, BUSINESS_A)).toBe(true);
    expect(isEntityInBusiness({ businessId: BUSINESS_B }, BUSINESS_A)).toBe(false);
    expect(isEntityInBusiness({}, BUSINESS_A)).toBe(false);
  });

  it('considera dois legados no mesmo escopo', () => {
    expect(hasSameBusinessScope({}, {})).toBe(true);
  });

  it('separa legado de entidade scoped e businesses distintos', () => {
    expect(hasSameBusinessScope({}, { businessId: BUSINESS_A })).toBe(false);
    expect(hasSameBusinessScope({ businessId: BUSINESS_A }, { businessId: BUSINESS_B })).toBe(false);
  });

  it('aceita UUID valido e ausencia explicita', () => {
    expect(() => validateBusinessId(BUSINESS_A)).not.toThrow();
    expect(() => validateOptionalBusinessId(undefined)).not.toThrow();
  });

  it.each(['', 'business-1', 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa'])(
    'rejeita businessId invalido: %s',
    (businessId) => {
      expect(() => validateBusinessId(businessId)).toThrow(/UUID valido/);
    },
  );

  it('rejeita relacao entre escopos diferentes com mensagem explicita', () => {
    expect(() =>
      assertSameBusinessScope(
        { businessId: BUSINESS_A },
        { businessId: BUSINESS_B },
        'Escopos diferentes.',
      ),
    ).toThrow('Escopos diferentes.');
  });
});
