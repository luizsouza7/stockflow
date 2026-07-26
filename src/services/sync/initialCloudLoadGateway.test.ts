import { describe, expect, it, vi } from 'vitest';
import {
  createInitialCloudLoadGateway,
  InitialCloudLoadRejectedError,
} from './initialCloudLoadGateway';

const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';

describe('gateway da carga inicial remota', () => {
  it('exige Supabase configurado', async () => {
    const gateway = createInitialCloudLoadGateway();
    expect(gateway.isConfigured()).toBe(false);
    await expect(gateway.getRemoteState(BUSINESS_ID)).rejects.toThrow(/nao esta configurado/);
  });

  it('le estado remoto somente pela RPC dedicada', async () => {
    const call = vi.fn().mockResolvedValue({
      data: [{
        category_count: 0,
        product_count: 0,
        movement_count: 0,
        sync_operation_count: 0,
        bootstrap_completed: false,
      }],
      error: null,
    });
    const state = await createInitialCloudLoadGateway({ call }).getRemoteState(BUSINESS_ID);
    expect(call).toHaveBeenCalledWith('get_business_inventory_initialization_state', {
      p_business_id: BUSINESS_ID,
    });
    expect(state).toEqual({
      categories: 0,
      products: 0,
      movements: 0,
      syncOperations: 0,
      bootstrapCompleted: false,
    });
  });

  it('envia texto estavel, hash e chave da carga inteira', async () => {
    const call = vi.fn().mockResolvedValue({
      data: [{ category_count: 2, product_count: 3, was_duplicate: false }],
      error: null,
    });
    const gateway = createInitialCloudLoadGateway({ call });
    await expect(gateway.initialize({
      businessId: BUSINESS_ID,
      idempotencyKey: 'inventory-bootstrap:key',
      payloadText: '{"categories":[],"products":[]}',
      payloadHash: 'a'.repeat(64),
    })).resolves.toEqual({ categories: 2, products: 3, wasDuplicate: false });
    expect(call).toHaveBeenCalledWith('initialize_business_inventory', {
      p_business_id: BUSINESS_ID,
      p_idempotency_key: 'inventory-bootstrap:key',
      p_payload_text: '{"categories":[],"products":[]}',
      p_payload_hash: 'a'.repeat(64),
    });
  });

  it('sanitiza recusas por remoto nao vazio', async () => {
    const gateway = createInitialCloudLoadGateway({
      call: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'REMOTE_INVENTORY_NOT_EMPTY' },
      }),
    });
    const promise = gateway.initialize({
      businessId: BUSINESS_ID,
      idempotencyKey: 'key',
      payloadText: '{}',
      payloadHash: 'a'.repeat(64),
    });
    await expect(promise).rejects.toBeInstanceOf(InitialCloudLoadRejectedError);
    await expect(promise).rejects.toThrow(/Nenhum dado foi sobrescrito/);
  });

  it('code vazio com Failed to fetch permanece resultado remoto incerto', async () => {
    const gateway = createInitialCloudLoadGateway({
      call: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '', message: 'TypeError: Failed to fetch' },
      }),
    });

    const error = await gateway.initialize({
      businessId: BUSINESS_ID,
      idempotencyKey: 'key',
      payloadText: '{}',
      payloadHash: 'a'.repeat(64),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(InitialCloudLoadRejectedError);
    expect((error as Error).message).toMatch(/resultado remoto.*reservada/i);
  });

  it('AbortError e falha desconhecida permanecem incertos', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    const aborted = createInitialCloudLoadGateway({
      call: vi.fn().mockRejectedValue(abortError),
    });
    await expect(aborted.initialize({
      businessId: BUSINESS_ID,
      idempotencyKey: 'key',
      payloadText: '{}',
      payloadHash: 'a'.repeat(64),
    })).rejects.toBe(abortError);

    const unknown = createInitialCloudLoadGateway({
      call: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'UNEXPECTED', message: 'connection reset' },
      }),
    });
    const error = await unknown.initialize({
      businessId: BUSINESS_ID,
      idempotencyKey: 'key',
      payloadText: '{}',
      payloadHash: 'a'.repeat(64),
    }).catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(InitialCloudLoadRejectedError);
  });

  it.each(['REMOTE_INVENTORY_NOT_EMPTY', 'INVALID_BOOTSTRAP_PAYLOAD'])(
    '%s permanece rejeicao definitiva conhecida',
    async (message) => {
      const gateway = createInitialCloudLoadGateway({
        call: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'P0001', message },
        }),
      });
      const error = await gateway.initialize({
        businessId: BUSINESS_ID,
        idempotencyKey: 'key',
        payloadText: '{}',
        payloadHash: 'a'.repeat(64),
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(InitialCloudLoadRejectedError);
    },
  );

  it.each([
    'PAYLOAD_TOO_LARGE',
    'TOO_MANY_CATEGORIES',
    'TOO_MANY_PRODUCTS',
  ])('sanitiza recusa pelo limite %s', async (message) => {
    const gateway = createInitialCloudLoadGateway({
      call: vi.fn().mockResolvedValue({
        data: null,
        error: { message },
      }),
    });
    await expect(
      gateway.initialize({
        businessId: BUSINESS_ID,
        idempotencyKey: 'key',
        payloadText: '{}',
        payloadHash: 'a'.repeat(64),
      }),
    ).rejects.toThrow(/limite de tamanho/);
  });
});
