export const MAX_CATEGORY_NAME_LENGTH = 80;

export function sanitizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function normalizeCategoryNameForComparison(name: string): string {
  return sanitizeCategoryName(name).toLocaleLowerCase('pt-BR');
}

export function validateCategoryName(name: string): string {
  const sanitizedName = sanitizeCategoryName(name);

  if (!sanitizedName) {
    throw new Error('Informe o nome da categoria.');
  }

  if (sanitizedName.length > MAX_CATEGORY_NAME_LENGTH) {
    throw new Error(`O nome da categoria deve ter no maximo ${MAX_CATEGORY_NAME_LENGTH} caracteres.`);
  }

  return sanitizedName;
}
