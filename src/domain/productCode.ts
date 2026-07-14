export function sanitizeProductCode(code: string): string {
  return code.trim();
}

export function normalizeProductCodeForComparison(code: string): string {
  return sanitizeProductCode(code).toLocaleLowerCase('pt-BR');
}
