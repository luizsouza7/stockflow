export interface BusinessScopedEntity {
  businessId?: string;
}

export type ActiveDataScope =
  | { kind: 'local' }
  | {
      kind: 'business';
      userId: string;
      businessId: string;
      businessName: string;
    };

export type LocalMutationContext =
  | { kind: 'local' }
  | {
      kind: 'business';
      userId: string;
      businessId: string;
    };

export type DataScopeReference =
  | { kind: 'local' }
  | { kind: 'business'; businessId: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function validateBusinessId(businessId: string): void {
  if (!isUuid(businessId)) {
    throw new Error('O identificador do estabelecimento deve ser um UUID valido.');
  }
}

export function validateUserId(userId: string): void {
  if (!isUuid(userId)) {
    throw new Error('O identificador do usuario deve ser um UUID valido.');
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

export function toMutationContext(scope: ActiveDataScope): LocalMutationContext {
  return scope.kind === 'local'
    ? { kind: 'local' }
    : {
        kind: 'business',
        userId: scope.userId,
        businessId: scope.businessId,
      };
}

export function validateMutationContext(context: LocalMutationContext): void {
  if (context.kind === 'local') return;
  validateUserId(context.userId);
  validateBusinessId(context.businessId);
}

export function isEntityInScope(
  entity: BusinessScopedEntity,
  scope: DataScopeReference,
): boolean {
  return scope.kind === 'local'
    ? isUnscopedEntity(entity)
    : entity.businessId === scope.businessId;
}

export function assertEntityInMutationContext(
  entity: BusinessScopedEntity,
  context: LocalMutationContext,
  message = 'O registro nao esta disponivel no contexto atual.',
): void {
  validateMutationContext(context);
  const matches =
    context.kind === 'local'
      ? isUnscopedEntity(entity)
      : entity.businessId === context.businessId;
  if (!matches) throw new Error(message);
}

export function areDataScopesEqual(
  left: ActiveDataScope,
  right: ActiveDataScope,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'local' || right.kind === 'local') return true;
  return left.userId === right.userId && left.businessId === right.businessId;
}

export function getDataScopeToken(scope: ActiveDataScope): string {
  return scope.kind === 'local'
    ? 'local'
    : `business:${scope.userId}:${scope.businessId}`;
}

export function getDataScopeLabel(scope: ActiveDataScope): string {
  return scope.kind === 'local'
    ? 'Dados locais deste dispositivo'
    : `Estabelecimento: ${scope.businessName}`;
}
