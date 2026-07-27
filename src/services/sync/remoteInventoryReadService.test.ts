import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import {
  createBusinessContextService,
  type BusinessContextService,
} from '../businessContextService';
import type { AuthService } from '../authService';
import { localDb } from '../db/localDb';
import type { RemoteInventoryCursor, RemoteInventoryPage } from '../../types/RemoteInventory';
import {
  RemoteInventoryReadError,
  type RemoteInventoryReadGateway,
} from './remoteInventoryReadGateway';
import { createRemoteInventoryReadService } from './remoteInventoryReadService';
import { backupExportService } from '../backupExportService';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '77777777-7777-4777-8777-777777777777';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_BUSINESS_ID = '33333333-3333-4333-8333-333333333333';
const ENTITY_ID = '44444444-4444-4444-8444-444444444444';
const TIME = '2026-07-26T20:00:00.000Z';
const WATERMARK = '2026-07-26T21:00:00.000Z';

describe('service somente leitura do inventario remoto', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('le a primeira pagina sem cursor e valida contexto', async () => {
    const { service, gateway, context } = createService();
    await service.readFirstRemoteInventoryPage({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      pageSize: 25,
    });
    expect(context.validateMembership).toHaveBeenCalledWith(USER_ID, BUSINESS_ID);
    expect(gateway.readPage).toHaveBeenCalledWith(BUSINESS_ID, undefined, 25);
  });

  it('le a proxima pagina com o cursor recebido', async () => {
    const { service, gateway } = createService();
    const cursor = makeCursor();
    await service.readNextRemoteInventoryPage({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      cursor,
    });
    expect(gateway.readPage).toHaveBeenCalledWith(BUSINESS_ID, cursor, undefined);
  });

  it('rejeita proxima pagina sem cursor e cursor de outro business', async () => {
    const { service, gateway } = createService();
    expect(() =>
      service.readNextRemoteInventoryPage({
        userId: USER_ID,
        businessId: BUSINESS_ID,
      } as Parameters<typeof service.readNextRemoteInventoryPage>[0]),
    ).toThrow(/primeira pagina/i);
    expect(() =>
      service.readNextRemoteInventoryPage({
        userId: USER_ID,
        businessId: BUSINESS_ID,
        cursor: { ...makeCursor(), businessId: OTHER_BUSINESS_ID },
      }),
    ).toThrow(/outro estabelecimento/i);
    expect(gateway.readPage).not.toHaveBeenCalled();
  });

  it('protege sessao e business ativo antes da chamada', async () => {
    const otherSession = createService({ session: createSession(OTHER_USER_ID) });
    await expect(
      otherSession.service.readFirstRemoteInventoryPage({
        userId: USER_ID,
        businessId: BUSINESS_ID,
      }),
    ).rejects.toMatchObject({ kind: 'authentication' });
    expect(otherSession.gateway.readPage).not.toHaveBeenCalled();

    const otherBusiness = createService({ selectedBusinessId: OTHER_BUSINESS_ID });
    await expect(
      otherBusiness.service.readFirstRemoteInventoryPage({
        userId: USER_ID,
        businessId: BUSINESS_ID,
      }),
    ).rejects.toMatchObject({ kind: 'business' });
    expect(otherBusiness.gateway.readPage).not.toHaveBeenCalled();
  });

  it('descarta resposta quando usuario muda durante a requisicao', async () => {
    const sessionService = {
      getSession: vi.fn<Pick<AuthService, 'getSession'>['getSession']>()
        .mockResolvedValueOnce(createSession())
        .mockResolvedValueOnce(createSession(OTHER_USER_ID)),
    };
    const { service } = createService({ sessionService });
    await expect(
      service.readFirstRemoteInventoryPage({ userId: USER_ID, businessId: BUSINESS_ID }),
    ).rejects.toThrow(/resultado foi descartado/i);
  });

  it('descarta resposta quando business muda durante a requisicao', async () => {
    const { service, context } = createService();
    context.getSelected
      .mockReturnValueOnce(BUSINESS_ID)
      .mockReturnValueOnce(OTHER_BUSINESS_ID);
    await expect(
      service.readFirstRemoteInventoryPage({ userId: USER_ID, businessId: BUSINESS_ID }),
    ).rejects.toThrow(/resultado foi descartado/i);
  });

  it('pagina remota gigante nao altera stores, selecao, backup ou cria cursor', async () => {
    const category = {
      id: ENTITY_ID,
      businessId: BUSINESS_ID,
      name: 'Local',
      createdAt: TIME,
      updatedAt: TIME,
      syncStatus: 'pending' as const,
    };
    const product = {
      id: '55555555-5555-4555-8555-555555555555',
      businessId: BUSINESS_ID,
      name: 'Produto local',
      code: 'LOCAL',
      salePriceInCents: 500,
      currentQuantity: 4,
      minimumStock: 1,
      createdAt: TIME,
      updatedAt: TIME,
      syncStatus: 'pending' as const,
    };
    const movement = {
      id: '66666666-6666-4666-8666-666666666666',
      businessId: BUSINESS_ID,
      productId: product.id,
      type: 'entrada' as const,
      quantity: 4,
      note: '',
      date: TIME,
      previousQuantity: 0,
      resultingQuantity: 4,
      syncStatus: 'pending' as const,
    };
    const outbox = {
      id: '88888888-8888-4888-8888-888888888888',
      entityType: 'category' as const,
      entityId: category.id,
      operation: 'category.created' as const,
      payload: category,
      status: 'pending' as const,
      attemptCount: 0,
      createdAt: TIME,
      updatedAt: TIME,
      userId: USER_ID,
      businessId: BUSINESS_ID,
      idempotencyKey: 'read-only-test',
    };
    await localDb.categories.add(category);
    await localDb.products.add(product);
    await localDb.movements.add(movement);
    await localDb.outbox.add(outbox);

    const storage = createObservableStorage();
    const context = createBusinessContextService(
      {
        listAvailable: vi.fn().mockResolvedValue({ data: [], error: null }),
        validateMembership: vi.fn().mockResolvedValue({
          data: { business_id: BUSINESS_ID },
          error: null,
        }),
      },
      storage,
    );
    await context.select(USER_ID, BUSINESS_ID, 'Loja observada');
    const selectSpy = vi.spyOn(context, 'select');
    const clearSpy = vi.spyOn(context, 'clearSelected');
    const gateway = {
      isConfigured: vi.fn<RemoteInventoryReadGateway['isConfigured']>().mockReturnValue(true),
      readPage: vi.fn<RemoteInventoryReadGateway['readPage']>()
        .mockRejectedValue(new RemoteInventoryReadError(
          'page-too-large',
          'A página remota excede o limite seguro. Tente uma quantidade menor de itens.',
        )),
    };
    const service = createRemoteInventoryReadService(
      gateway,
      context,
      { getSession: vi.fn().mockResolvedValue(createSession()) },
    );
    const fixedBackupDate = new Date('2026-07-26T22:00:00.000Z');
    const before = await snapshotLocalState();
    const persistedSelectionBefore = storage.snapshot();
    const backupBefore = await backupExportService.createJsonBackup(fixedBackupDate);

    await expect(
      service.readFirstRemoteInventoryPage({ userId: USER_ID, businessId: BUSINESS_ID }),
    ).rejects.toMatchObject({ kind: 'page-too-large' });

    const backupAfter = await backupExportService.createJsonBackup(fixedBackupDate);
    expect(await snapshotLocalState()).toEqual(before);
    expect(storage.snapshot()).toEqual(persistedSelectionBefore);
    expect(context.getSelected(USER_ID)).toBe(BUSINESS_ID);
    expect(selectSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(backupAfter).toEqual(backupBefore);
    expect(JSON.parse(backupAfter.content).databaseSchemaVersion)
      .toBe(JSON.parse(backupBefore.content).databaseSchemaVersion);
    expect([...storage.snapshot().keys()].some((key) => /cursor/i.test(key))).toBe(false);
    expect(localDb.verno).toBe(12);
    expect(localDb.tables.map(({ name }) => name).sort()).toEqual(
      ['categories', 'initialCloudLoads', 'movements', 'outbox', 'products'].sort(),
    );
  });

  it('leitura bem-sucedida tambem nao altera dados, syncStatus ou outbox', async () => {
    const category = {
      id: ENTITY_ID,
      businessId: BUSINESS_ID,
      name: 'Local',
      createdAt: TIME,
      updatedAt: TIME,
      syncStatus: 'error' as const,
    };
    await localDb.categories.add(category);
    const before = await snapshotLocalState();
    const { service } = createService();

    await service.readFirstRemoteInventoryPage({ userId: USER_ID, businessId: BUSINESS_ID });

    expect(await snapshotLocalState()).toEqual(before);
    expect((await localDb.categories.get(ENTITY_ID))?.syncStatus).toBe('error');
  });
});

async function snapshotLocalState() {
  return {
    categories: await localDb.categories.toArray(),
    products: await localDb.products.toArray(),
    movements: await localDb.movements.toArray(),
    outbox: await localDb.outbox.toArray(),
    initialCloudLoads: await localDb.initialCloudLoads.toArray(),
  };
}

function createObservableStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    snapshot: () => new Map(values),
  };
}

function createService(options: {
  session?: Session | null;
  sessionService?: Pick<AuthService, 'getSession'>;
  selectedBusinessId?: string;
} = {}) {
  const gateway = {
    isConfigured: vi.fn<RemoteInventoryReadGateway['isConfigured']>().mockReturnValue(true),
    readPage: vi.fn<RemoteInventoryReadGateway['readPage']>().mockResolvedValue(emptyPage()),
  };
  const context = {
    isConfigured: vi.fn<BusinessContextService['isConfigured']>().mockReturnValue(true),
    listAvailable: vi.fn<BusinessContextService['listAvailable']>().mockResolvedValue([]),
    validateMembership:
      vi.fn<BusinessContextService['validateMembership']>().mockResolvedValue(true),
    select: vi.fn<BusinessContextService['select']>().mockResolvedValue(undefined),
    getSelected:
      vi.fn<BusinessContextService['getSelected']>()
        .mockReturnValue(options.selectedBusinessId ?? BUSINESS_ID),
    clearSelected: vi.fn<BusinessContextService['clearSelected']>(),
  };
  const sessionService = options.sessionService ?? {
    getSession: vi.fn().mockResolvedValue(
      options.session === undefined ? createSession() : options.session,
    ),
  };
  return {
    gateway,
    context,
    service: createRemoteInventoryReadService(gateway, context, sessionService),
  };
}

function emptyPage(): RemoteInventoryPage {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    watermark: WATERMARK,
    pageSize: 50,
    returnedCount: 0,
  };
}

function makeCursor(): RemoteInventoryCursor {
  return {
    version: 1,
    businessId: BUSINESS_ID,
    watermark: WATERMARK,
    after: { sortTime: TIME, entityRank: 1, entityId: ENTITY_ID },
  };
}

function createSession(userId = USER_ID): Session {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'pessoa@stockflow.test',
      app_metadata: {},
      user_metadata: {},
      created_at: TIME,
    },
  };
}
