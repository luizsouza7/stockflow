import type { Movement, MovementType, TrackedMovement } from '../types/Movement';

interface StockSnapshot {
  previousQuantity: number;
  resultingQuantity: number;
}

export function calculateStockSnapshot(
  previousQuantity: number,
  type: MovementType,
  quantity: number,
): StockSnapshot {
  if (!Number.isInteger(previousQuantity) || previousQuantity < 0) {
    throw new Error('O estoque atual do produto e invalido.');
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('A quantidade deve ser um numero inteiro maior que zero.');
  }

  if (type !== 'entrada' && type !== 'saida') {
    throw new Error('Tipo de movimentacao invalido.');
  }

  const resultingQuantity =
    type === 'entrada' ? previousQuantity + quantity : previousQuantity - quantity;

  if (resultingQuantity < 0) {
    throw new Error('A saida nao pode ser maior que a quantidade disponivel.');
  }

  return { previousQuantity, resultingQuantity };
}

export function hasStockSnapshot(movement: Movement): movement is TrackedMovement {
  return (
    movement.isLegacy !== true &&
    Number.isInteger(movement.previousQuantity) &&
    Number.isInteger(movement.resultingQuantity) &&
    movement.previousQuantity >= 0 &&
    movement.resultingQuantity >= 0
  );
}
