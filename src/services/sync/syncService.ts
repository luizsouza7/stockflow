import { movementRepository } from '../../repositories/movementRepository';
import { productRepository } from '../../repositories/productRepository';

export async function syncPendingData() {
  const [products, movements] = await Promise.all([
    productRepository.findPending(),
    movementRepository.findPending(),
  ]);

  // Preparacao local para uma futura fila de sincronizacao; nao realiza sincronizacao remota.
  // No TCC, este ponto deve conectar ao Supabase, enviar dados pendentes,
  // tratar conflitos e atualizar syncStatus para "synced" ou "error".
  return {
    pendingProducts: products,
    pendingMovements: movements,
    totalPending: products.length + movements.length,
  };
}
