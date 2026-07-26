export function validateOptionalRemoteVersion(
  value: unknown,
): asserts value is number | undefined {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || Number(value) < 1)
  ) {
    throw new Error('A versao remota conhecida deve ser um inteiro positivo.');
  }
}

export function getValidatedRemoteVersion(value: unknown): number | undefined {
  validateOptionalRemoteVersion(value);
  return value;
}
