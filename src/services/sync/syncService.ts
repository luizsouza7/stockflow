import { localDb } from '../db/localDb';

export async function syncPendingData() {
  const [products, movements] = await Promise.all([
    localDb.products.where('syncStatus').equals('pending').toArray(),
    localDb.movements.where('syncStatus').equals('pending').toArray(),
  ]);

  // Etapa 1 / Projeto Integrador 2: simulacao da fila de sincronizacao.
  // No TCC, este ponto deve conectar ao Supabase, enviar dados pendentes,
  // tratar conflitos e atualizar syncStatus para "synced" ou "error".
  return {
    pendingProducts: products,
    pendingMovements: movements,
    totalPending: products.length + movements.length,
  };
}
