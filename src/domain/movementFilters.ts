import type { MovementType, MovementWithProduct } from '../types/Movement';

export type MovementTypeFilter = 'all' | MovementType;
export type MovementSort = 'newest' | 'oldest';

export interface MovementFilters {
  productId: string;
  type: MovementTypeFilter;
  startDate: string;
  endDate: string;
  sort: MovementSort;
}

export interface MovementFilterResult {
  movements: MovementWithProduct[];
  validationError?: string;
}

export interface MovementProductOption {
  id: string;
  name: string;
  code: string;
}

export const DEFAULT_MOVEMENT_FILTERS: MovementFilters = {
  productId: '',
  type: 'all',
  startDate: '',
  endDate: '',
  sort: 'newest',
};

export function filterAndSortMovements(
  movements: MovementWithProduct[],
  filters: MovementFilters,
): MovementFilterResult {
  const period = getPeriodBounds(filters.startDate, filters.endDate);

  if (period.validationError) {
    return { movements: [], validationError: period.validationError };
  }

  const filtered = movements.filter((movement) => {
    const movementTimestamp = Date.parse(movement.date);
    const matchesProduct = !filters.productId || movement.productId === filters.productId;
    const matchesType = filters.type === 'all' || movement.type === filters.type;
    const matchesStart =
      period.startTimestamp === undefined ||
      (!Number.isNaN(movementTimestamp) && movementTimestamp >= period.startTimestamp);
    const matchesEnd =
      period.endExclusiveTimestamp === undefined ||
      (!Number.isNaN(movementTimestamp) && movementTimestamp < period.endExclusiveTimestamp);

    return matchesProduct && matchesType && matchesStart && matchesEnd;
  });

  return {
    movements: filtered
      .map((movement, originalIndex) => ({ movement, originalIndex }))
      .sort((first, second) => {
        const firstTimestamp = safeTimestamp(first.movement.date);
        const secondTimestamp = safeTimestamp(second.movement.date);
        const comparison =
          filters.sort === 'oldest'
            ? firstTimestamp - secondTimestamp
            : secondTimestamp - firstTimestamp;
        return comparison || first.originalIndex - second.originalIndex;
      })
      .map(({ movement }) => movement),
  };
}

export function getMovementProductOptions(
  movements: MovementWithProduct[],
): MovementProductOption[] {
  const optionsById = new Map<string, MovementProductOption>();

  for (const movement of movements) {
    if (!optionsById.has(movement.productId)) {
      optionsById.set(movement.productId, {
        id: movement.productId,
        name: movement.productName,
        code: movement.productCode,
      });
    }
  }

  return [...optionsById.values()].sort((first, second) =>
    first.name.localeCompare(second.name, 'pt-BR', { sensitivity: 'base', numeric: true }),
  );
}

export function hasActiveMovementFilters(filters: MovementFilters): boolean {
  return (
    filters.productId !== DEFAULT_MOVEMENT_FILTERS.productId ||
    filters.type !== DEFAULT_MOVEMENT_FILTERS.type ||
    filters.startDate !== DEFAULT_MOVEMENT_FILTERS.startDate ||
    filters.endDate !== DEFAULT_MOVEMENT_FILTERS.endDate ||
    filters.sort !== DEFAULT_MOVEMENT_FILTERS.sort
  );
}

interface PeriodBounds {
  startTimestamp?: number;
  endExclusiveTimestamp?: number;
  validationError?: string;
}

function getPeriodBounds(startDate: string, endDate: string): PeriodBounds {
  const start = startDate ? parseLocalDate(startDate) : undefined;
  const end = endDate ? parseLocalDate(endDate) : undefined;

  if ((startDate && !start) || (endDate && !end)) {
    return { validationError: 'Informe um periodo de datas valido.' };
  }

  if (start && end && start.getTime() > end.getTime()) {
    return { validationError: 'A data inicial nao pode ser posterior a data final.' };
  }

  return {
    startTimestamp: start?.getTime(),
    endExclusiveTimestamp: end
      ? new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime()
      : undefined,
  };
}

function parseLocalDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function safeTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
