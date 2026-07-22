export interface BusinessScopedEntity {
  businessId?: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateBusinessId(businessId: string): void {
  if (!UUID_PATTERN.test(businessId)) {
    throw new Error('O identificador do estabelecimento deve ser um UUID valido.');
  }
}

export function validateOptionalBusinessId(
  businessId: unknown,
): asserts businessId is string | undefined {
  if (businessId === undefined) return;
  if (typeof businessId !== 'string') {
    throw new Error('O identificador do estabelecimento deve ser um UUID valido.');
  }
  validateBusinessId(businessId);
}

export function isUnscopedEntity(entity: BusinessScopedEntity): boolean {
  return entity.businessId === undefined;
}

export function isEntityInBusiness(
  entity: BusinessScopedEntity,
  businessId: string,
): boolean {
  validateBusinessId(businessId);
  return entity.businessId === businessId;
}

export function hasSameBusinessScope(
  left: BusinessScopedEntity,
  right: BusinessScopedEntity,
): boolean {
  return left.businessId === right.businessId;
}

export function assertSameBusinessScope(
  left: BusinessScopedEntity,
  right: BusinessScopedEntity,
  message: string,
): void {
  if (!hasSameBusinessScope(left, right)) throw new Error(message);
}
