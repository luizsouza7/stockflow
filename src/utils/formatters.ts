export function parseCurrencyToCents(value: string): number {
  const normalized = value.trim().replace(',', '.');

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Informe um preco valido com no maximo duas casas decimais.');
  }

  const decimalValue = Number(normalized);

  if (!Number.isFinite(decimalValue) || decimalValue < 0) {
    throw new Error('O preco deve ser um valor valido e nao negativo.');
  }

  const valueInCents = Math.round(decimalValue * 100);

  if (!Number.isSafeInteger(valueInCents)) {
    throw new Error('O preco informado esta fora do intervalo seguro.');
  }

  return valueInCents;
}

export function formatCentsToBRL(valueInCents: number): string {
  assertValidCents(valueInCents);

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valueInCents / 100);
}

export function formatCentsForInput(valueInCents: number): string {
  assertValidCents(valueInCents);
  return `${Math.floor(valueInCents / 100)},${String(valueInCents % 100).padStart(2, '0')}`;
}

function assertValidCents(valueInCents: number): void {
  if (!Number.isSafeInteger(valueInCents) || valueInCents < 0) {
    throw new Error('O valor em centavos deve ser um inteiro seguro e nao negativo.');
  }
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
