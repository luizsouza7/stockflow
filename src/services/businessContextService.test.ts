import { describe, expect, it, vi } from 'vitest';
import { createBusinessContextService } from './businessContextService';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';

describe('contexto seguro de estabelecimento', () => {
  it('lista somente registros validos retornados sob RLS', async () => {
    const api = createApi();
    api.listAvailable.mockResolvedValue({
      data: [{ id: BUSINESS_ID, name: ' Loja Central ' }],
      error: null,
    });
    const service = createBusinessContextService(api, createStorage());

    await expect(service.listAvailable()).resolves.toEqual([
      { id: BUSINESS_ID, name: 'Loja Central' },
    ]);
  });

  it('nao aceita businessId digitado sem membership ativa', async () => {
    const api = createApi();
    api.validateMembership.mockResolvedValue({ data: null, error: null });
    const storage = createStorage();
    const service = createBusinessContextService(api, storage);

    await expect(service.select(USER_ID, BUSINESS_ID)).rejects.toThrow(/vinculado a sua conta/);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('armazena somente o businessId em chave isolada pelo usuario', async () => {
    const api = createApi();
    api.validateMembership.mockResolvedValue({
      data: { business_id: BUSINESS_ID },
      error: null,
    });
    const storage = createStorage();
    const service = createBusinessContextService(api, storage);

    await service.select(USER_ID, BUSINESS_ID);

    expect(storage.setItem).toHaveBeenCalledWith(
      `stockflow:selected-business:${USER_ID}`,
      BUSINESS_ID,
    );
  });

  it('ignora selecao armazenada invalida', () => {
    const storage = createStorage('business-livre-digitado');
    const service = createBusinessContextService(createApi(), storage);
    expect(service.getSelected(USER_ID)).toBeUndefined();
  });

  it('limpa o contexto somente para o usuario informado', () => {
    const storage = createStorage();
    const service = createBusinessContextService(createApi(), storage);
    service.clearSelected(USER_ID);
    expect(storage.removeItem).toHaveBeenCalledWith(`stockflow:selected-business:${USER_ID}`);
  });

  it('nao consulta Supabase quando a integracao nao esta configurada', async () => {
    const service = createBusinessContextService(undefined, createStorage());
    expect(service.isConfigured()).toBe(false);
    await expect(service.listAvailable()).rejects.toThrow(/nao esta configurado/);
  });
});

function createApi() {
  return {
    listAvailable: vi.fn().mockResolvedValue({ data: [], error: null }),
    validateMembership: vi.fn().mockResolvedValue({
      data: { business_id: BUSINESS_ID },
      error: null,
    }),
  };
}

function createStorage(storedValue: string | null = null) {
  return {
    getItem: vi.fn().mockReturnValue(storedValue),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
}
