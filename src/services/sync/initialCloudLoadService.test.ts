import { describe, expect, it, vi } from 'vitest';
import type { InitialCloudLoadSnapshot } from '../../repositories/initialCloudLoadRepository';
import {
  InitialCloudLoadRejectedError,
  type InitialCloudLoadGateway,
} from './initialCloudLoadGateway';
import { createInitialCloudLoadService } from './initialCloudLoadService';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_BUSINESS_ID = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const MOVEMENT_ID = '66666666-6666-4666-8666-666666666666';
const NOW = '2026-07-25T12:00:00.000Z';

describe('service da carga inicial remota', () => {
  it('combina preview local e remoto vazio sem escrever localmente', async () => {
    const dependencies = createDependencies();
    const service = createService(dependencies);
    const result = await service.preview(context());
    expect(result.status).toBe('ready');
    expect(result.preview).toMatchObject({
      categories: 1,
      products: 1,
      historicalMovements: 1,
      remoteState: 'empty',
      eligible: true,
    });
    expect(dependencies.repository.readSnapshot).toHaveBeenCalledWith(BUSINESS_ID);
    expect(dependencies.gateway.initialize).not.toHaveBeenCalled();
  });

  it.each([
    ['categories', { categories: 1 }],
    ['products', { products: 1 }],
    ['movements', { movements: 1 }],
    ['syncOperations', { syncOperations: 1 }],
    ['bootstrapCompleted', { bootstrapCompleted: true }],
  ] as const)('bloqueia remoto incompatível por %s', async (_label, change) => {
    const dependencies = createDependencies();
    dependencies.gateway.getRemoteState.mockResolvedValue({ ...emptyRemote(), ...change });
    const result = await createService(dependencies).preview(context());
    expect(result.status).toBe('blocked');
    expect(result.preview?.eligible).toBe(false);
  });

  it('nova previa apos conclusao informa que o remoto ja foi inicializado', async () => {
    const dependencies = createDependencies();
    dependencies.gateway.getRemoteState.mockResolvedValue({
      ...emptyRemote(),
      bootstrapCompleted: true,
    });

    const result = await createService(dependencies).preview(context());

    expect(result).toMatchObject({
      status: 'blocked',
      preview: {
        remoteState: 'initialized',
        eligible: false,
        blockers: [
          expect.objectContaining({
            code: 'remote-not-empty',
            message: expect.stringMatching(/ja possui uma carga inicial registrada/i),
          }),
        ],
      },
    });
    expect(dependencies.gateway.initialize).not.toHaveBeenCalled();
  });

  it.each(['pending', 'error'] as const)(
    'considera outbox %s compatível reservavel',
    async (status) => {
      const dependencies = createDependencies({
        outbox: [outboxEntry({ status })],
      });
      const result = await createService(dependencies).preview(context());
      expect(result.status).toBe('ready');
      expect(result.preview).toMatchObject({
        blockingOutbox: 0,
        reservableOutbox: 1,
        reservableEventIds: ['99999999-9999-4999-8999-999999999998'],
      });
    },
  );

  it.each(['processing', 'conflict'] as const)(
    'bloqueia outbox %s que nao pode ser reservada',
    async (status) => {
      const dependencies = createDependencies({
        outbox: [outboxEntry({ status })],
      });
      const result = await createService(dependencies).preview(context());
      expect(result.status).toBe('blocked');
      expect(result.preview?.blockers.some(({ code }) => code === `outbox-${status}`)).toBe(true);
    },
  );

  it('detecta evento relacionado sem userId e de outro usuario', async () => {
    const missing = createDependencies({ outbox: [outboxEntry({ userId: undefined })] });
    const other = createDependencies({ outbox: [outboxEntry({ userId: OTHER_USER_ID })] });
    expect((await createService(missing).preview(context())).preview?.blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'outbox-user-missing' })]));
    expect((await createService(other).preview(context())).preview?.blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'outbox-other-user' })]));
  });

  it('bloqueia evento synced porque ele registra push individual anterior', async () => {
    const dependencies = createDependencies({ outbox: [outboxEntry({ status: 'synced' })] });
    const result = await createService(dependencies).preview(context());
    expect(result.status).toBe('blocked');
    expect(result.preview?.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'outbox-synced-history' }),
      ]),
    );
  });

  it('bloqueia relacao orfa e categoria excluida para produto ativo', async () => {
    const orphan = createDependencies({
      products: [product({ categoryId: '77777777-7777-4777-8777-777777777777' })],
    });
    const incompatible = createDependencies({
      categories: [category({ deletedAt: NOW })],
    });
    expect((await createService(orphan).preview(context())).preview?.blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'orphan-category' })]));
    expect((await createService(incompatible).preview(context())).preview?.blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'incompatible-category' })]));
  });

  it('aceita produto excluido referenciando categoria excluida', async () => {
    const dependencies = createDependencies({
      categories: [category({ deletedAt: NOW })],
      products: [product({ deletedAt: NOW })],
    });
    expect((await createService(dependencies).preview(context())).status).toBe('ready');
  });

  it('ordena payload deterministicamente por UUID', async () => {
    const secondCategoryId = '77777777-7777-4777-8777-777777777777';
    const dependencies = createDependencies({
      categories: [category({ id: secondCategoryId, name: 'B' }), category()],
    });
    const first = await createService(dependencies).preview(context());
    dependencies.repository.readSnapshot.mockResolvedValue({
      ...snapshot(),
      categories: [category(), category({ id: secondCategoryId, name: 'B' })],
    });
    const second = await createService(dependencies).preview(context());
    expect(first.preview?.payloadText).toBe(second.preview?.payloadText);
    expect(first.preview?.payloadHash).toBe(second.preview?.payloadHash);
  });

  it('nao envia remoteVersion como campo livre no payload do bootstrap', async () => {
    const dependencies = createDependencies({
      categories: [category({ remoteVersion: 7 })],
      products: [product({ remoteVersion: 9 })],
    });
    const result = await createService(dependencies).preview(context());
    expect(result.preview?.payloadText).not.toContain('remoteVersion');
    expect(result.status).toBe('blocked');
    expect(result.preview?.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'known-category-remote-version' }),
        expect.objectContaining({ code: 'known-product-remote-version' }),
      ]),
    );
  });

  it('bloqueia remoteVersion local invalida quando presente', async () => {
    const dependencies = createDependencies({
      categories: [category({ remoteVersion: 0 })],
      products: [product({ remoteVersion: 1.5 })],
    });
    const result = await createService(dependencies).preview(context());
    expect(result.status).toBe('blocked');
    expect(result.preview?.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-category-remote-version' }),
      expect.objectContaining({ code: 'invalid-product-remote-version' }),
    ]));
  });

  it('exige confirmacao e previa atual', async () => {
    const service = createService(createDependencies());
    await expect(service.execute({ ...context(), confirmed: false })).resolves.toMatchObject({
      status: 'blocked',
    });
    await expect(service.execute({ ...context(), confirmed: true })).resolves.toMatchObject({
      status: 'blocked',
    });
  });

  it('invalida mudanca local entre previa e execucao', async () => {
    const dependencies = createDependencies();
    const service = createService(dependencies);
    const preview = (await service.preview(context())).preview!;
    dependencies.repository.reserveSnapshot.mockRejectedValue(
      new Error('Os dados locais mudaram desde a previa.'),
    );
    const result = await service.execute({ ...context(), confirmed: true, preview });
    expect(result.status).toBe('blocked');
    expect(result.message).toMatch(/mudaram/);
    expect(dependencies.gateway.initialize).not.toHaveBeenCalled();
  });

  it('invalida mudanca de business, usuario e offline', async () => {
    const dependencies = createDependencies();
    const service = createService(dependencies);
    const preview = (await service.preview(context())).preview!;
    expect(await service.execute({
      ...context(),
      businessId: OTHER_BUSINESS_ID,
      confirmed: true,
      preview,
    })).toMatchObject({ status: 'blocked' });
    expect(await service.execute({
      ...context(),
      userId: OTHER_USER_ID,
      confirmed: true,
      preview,
    })).toMatchObject({ status: 'blocked' });
    expect(await service.execute({
      ...context(),
      isOnline: false,
      confirmed: true,
      preview,
    })).toMatchObject({ status: 'blocked' });
  });

  it('executa somente categorias e produtos com chave propria da carga', async () => {
    const dependencies = createDependencies();
    const service = createService(dependencies);
    const preview = (await service.preview(context())).preview!;
    const result = await service.execute({ ...context(), confirmed: true, preview });
    expect(result.status).toBe('completed');
    expect(dependencies.gateway.initialize).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      idempotencyKey: 'inventory-bootstrap:88888888-8888-4888-8888-888888888888',
      payloadText: preview.payloadText,
      payloadHash: preview.payloadHash,
    });
    expect(dependencies.repository.reserveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: expect.objectContaining({
          businessId: BUSINESS_ID,
          categoryIds: [CATEGORY_ID],
          productIds: [PRODUCT_ID],
        }),
        expectedStateText: preview.reservationStateText,
      }),
    );
    expect(dependencies.repository.markRemoteConfirmed).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.finalizeReservedSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ remoteVersion: 1 }),
    );
    expect(preview.payloadText).not.toContain('movement');
    expect(preview.payloadText).not.toContain('outbox');
  });

  it('preserva retry idempotente quando a resposta anterior foi perdida', async () => {
    const dependencies = createDependencies();
    dependencies.gateway.initialize.mockResolvedValue({
      categories: 1,
      products: 1,
      wasDuplicate: true,
    });
    const service = createService(dependencies);
    const preview = (await service.preview(context())).preview!;
    dependencies.gateway.getRemoteState.mockResolvedValue({
      ...emptyRemote(),
      categories: 1,
      products: 1,
      bootstrapCompleted: true,
    });
    const result = await service.execute({ ...context(), confirmed: true, preview });
    expect(result.message).toMatch(/reparados sem duplicacao/);
    expect(dependencies.gateway.initialize).toHaveBeenCalledTimes(1);
    expect(dependencies.gateway.getRemoteState).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.finalizeReservedSnapshot).toHaveBeenCalledTimes(1);
  });

  it('falha local apos commit nao conclui e retry apos reload repara sem nova RPC', async () => {
    const dependencies = createDependencies();
    dependencies.repository.finalizeReservedSnapshot
      .mockRejectedValueOnce(new Error('IndexedDB indisponivel'))
      .mockResolvedValueOnce(undefined);
    const service = createService(dependencies);
    const preview = (await service.preview(context())).preview!;

    const failed = await service.execute({ ...context(), confirmed: true, preview });
    expect(failed).toMatchObject({
      status: 'blocked',
      message: expect.stringMatching(/carga remota foi confirmada.*finalizacao local/i),
      recoveryPreview: expect.objectContaining({
        reservationOperationId: expect.any(String),
      }),
    });
    expect(dependencies.gateway.initialize).toHaveBeenCalledTimes(1);

    const operation = dependencies.repository.reserveSnapshot.mock.calls[0]![0]
      .operation;
    dependencies.repository.findActiveOperation.mockResolvedValue({
      ...operation,
      status: 'remote-confirmed',
      remoteResult: {
        categories: 1,
        products: 1,
        wasDuplicate: false,
      },
    });

    const repaired = await service.execute({
      ...context(),
      confirmed: true,
      preview: failed.recoveryPreview,
    });
    expect(repaired).toMatchObject({
      status: 'completed',
      message: expect.stringMatching(/snapshot inicial/i),
    });
    expect(dependencies.gateway.initialize).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.finalizeReservedSnapshot).toHaveBeenCalledTimes(2);
  });

  it('rejeicao remota definitiva libera reservas e preserva retry normal', async () => {
    const dependencies = createDependencies({
      outbox: [outboxEntry({ status: 'pending' })],
    });
    dependencies.gateway.initialize.mockRejectedValue(
      new InitialCloudLoadRejectedError('Snapshot recusado.'),
    );
    const service = createService(dependencies);
    const preview = (await service.preview(context())).preview!;

    const result = await service.execute({
      ...context(),
      confirmed: true,
      preview,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      message: 'Snapshot recusado.',
    });
    expect(dependencies.repository.releaseReservation).toHaveBeenCalledTimes(1);
    expect(result.recoveryPreview).toBeUndefined();
  });

  it('falha de transporte mantem reserva persistida para retry idempotente', async () => {
    const dependencies = createDependencies({
      outbox: [outboxEntry({ status: 'pending' })],
    });
    dependencies.gateway.initialize.mockRejectedValueOnce(
      new Error('resposta perdida'),
    );
    const service = createService(dependencies);
    const preview = (await service.preview(context())).preview!;

    const failed = await service.execute({
      ...context(),
      confirmed: true,
      preview,
    });

    expect(failed).toMatchObject({
      status: 'blocked',
      recoveryPreview: expect.objectContaining({
        reservationOperationId: expect.any(String),
      }),
    });
    expect(dependencies.repository.releaseReservation).not.toHaveBeenCalled();
  });

  it.each([
    new DOMException('aborted', 'AbortError'),
    new Error('connection reset desconhecido'),
  ])('erro remoto incerto %s nao libera a reserva', async (remoteError) => {
    const dependencies = createDependencies({
      outbox: [outboxEntry({ status: 'pending' })],
    });
    dependencies.gateway.initialize.mockRejectedValue(remoteError);
    const service = createService(dependencies);
    const preview = (await service.preview(context())).preview!;

    const result = await service.execute({
      ...context(),
      confirmed: true,
      preview,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      recoveryPreview: expect.objectContaining({
        idempotencyKey: preview.idempotencyKey,
        payloadText: preview.payloadText,
      }),
    });
    expect(dependencies.repository.releaseReservation).not.toHaveBeenCalled();
  });

  it('operacao completed nao vira reparo nem chama novamente o gateway', async () => {
    const dependencies = createDependencies();
    const service = createService(dependencies);
    const preview = (await service.preview(context())).preview!;
    const completedPreview = {
      ...preview,
      reservationOperationId: preview.idempotencyKey,
    };
    dependencies.repository.findActiveOperation.mockResolvedValue(undefined);

    const result = await service.execute({
      ...context(),
      confirmed: true,
      preview: completedPreview,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      message: expect.stringMatching(/reserva persistida.*nao corresponde/i),
    });
    expect(result.recoveryPreview).toBeUndefined();
    expect(dependencies.gateway.initialize).not.toHaveBeenCalled();
    expect(dependencies.repository.finalizeReservedSnapshot).not.toHaveBeenCalled();
  });
});

function context() {
  return {
    userId: USER_ID,
    businessId: BUSINESS_ID,
    businessName: 'Loja Central',
    isOnline: true,
  };
}

function category(changes = {}) {
  return {
    id: CATEGORY_ID,
    businessId: BUSINESS_ID,
    name: 'Categoria',
    createdAt: NOW,
    updatedAt: NOW,
    syncStatus: 'synced' as const,
    ...changes,
  };
}

function product(changes = {}) {
  return {
    id: PRODUCT_ID,
    businessId: BUSINESS_ID,
    name: 'Produto',
    code: 'P-1',
    categoryId: CATEGORY_ID,
    salePriceInCents: 1000,
    currentQuantity: 5,
    minimumStock: 1,
    createdAt: NOW,
    updatedAt: NOW,
    syncStatus: 'synced' as const,
    ...changes,
  };
}

function movement() {
  return {
    id: MOVEMENT_ID,
    businessId: BUSINESS_ID,
    productId: PRODUCT_ID,
    type: 'entrada' as const,
    quantity: 5,
    note: '',
    date: NOW,
    previousQuantity: 0,
    resultingQuantity: 5,
    syncStatus: 'synced' as const,
  };
}

function outboxEntry(changes = {}) {
  return {
    id: '99999999-9999-4999-8999-999999999998',
    entityType: 'product' as const,
    entityId: PRODUCT_ID,
    operation: 'product.updated' as const,
    payload: product(),
    status: 'pending' as const,
    attemptCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    userId: USER_ID,
    businessId: BUSINESS_ID,
    idempotencyKey: 'event-key',
    ...changes,
  };
}

function snapshot(changes: Partial<InitialCloudLoadSnapshot> = {}): InitialCloudLoadSnapshot {
  return {
    categories: [category()],
    products: [product()],
    movements: [movement()],
    outbox: [],
    ...changes,
  };
}

function emptyRemote() {
  return {
    categories: 0,
    products: 0,
    movements: 0,
    syncOperations: 0,
    bootstrapCompleted: false,
  };
}

function createDependencies(changes: Partial<InitialCloudLoadSnapshot> = {}) {
  return {
    repository: {
      readSnapshot: vi.fn().mockResolvedValue(snapshot(changes)),
      findActiveOperation: vi.fn().mockResolvedValue(undefined),
      reserveSnapshot: vi.fn().mockResolvedValue(undefined),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      markRemoteConfirmed: vi.fn().mockResolvedValue(undefined),
      finalizeReservedSnapshot: vi.fn().mockResolvedValue(undefined),
      applyRemoteBaseline: vi.fn().mockResolvedValue(undefined),
    },
    gateway: {
      isConfigured: vi.fn(() => true),
      getRemoteState: vi.fn().mockResolvedValue(emptyRemote()),
      initialize: vi.fn().mockResolvedValue({
        categories: 1,
        products: 1,
        wasDuplicate: false,
      }),
    },
    context: {
      isConfigured: vi.fn(() => true),
      validateMembership: vi.fn(async (userId, businessId) =>
        userId === USER_ID && businessId === BUSINESS_ID),
    },
    auth: {
      isConfigured: vi.fn(() => true),
      getSession: vi.fn(async () => ({ user: { id: USER_ID } })),
    },
  };
}

function createService(dependencies: ReturnType<typeof createDependencies>) {
  return createInitialCloudLoadService(
    dependencies.repository,
    dependencies.gateway as unknown as InitialCloudLoadGateway,
    dependencies.context as never,
    dependencies.auth as never,
    () => '88888888-8888-4888-8888-888888888888',
  );
}
