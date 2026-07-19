import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { OutboxEntry } from '../../types/Sync';
import type { BusinessContextService } from '../businessContextService';
import { localDb } from '../db/localDb';
import { createManualPushService } from './manualPushService';
import type { SyncRemoteGateway } from './syncRemoteGateway';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';

describe('push remoto manual e controlado', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('bloqueia sem Supabase configurado e nao toca a outbox', async () => {
    const entry = categoryEntry();
    await localDb.outbox.add(entry);
    const gateway = createGateway(false);
    const service = createTestService(gateway, createContext());

    const result = await service.push({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    expect(result).toMatchObject({ status: 'blocked', message: expect.stringMatching(/Supabase/) });
    expect(gateway.push).not.toHaveBeenCalled();
    expect(await localDb.outbox.get(entry.id)).toMatchObject({ status: 'pending' });
  });

  it('bloqueia sem sessao autenticada', async () => {
    const gateway = createGateway();
    const service = createTestService(gateway, createContext());
    const result = await service.push({ businessId: BUSINESS_ID, isOnline: true });
    expect(result.message).toMatch(/Entre na sua conta/);
    expect(gateway.push).not.toHaveBeenCalled();
  });

  it('bloqueia sem estabelecimento selecionado', async () => {
    const gateway = createGateway();
    const service = createTestService(gateway, createContext());
    const result = await service.push({ userId: USER_ID, isOnline: true });
    expect(result.message).toMatch(/Selecione e valide/);
    expect(gateway.push).not.toHaveBeenCalled();
  });

  it('reconfirma a sessao e bloqueia quando ela expirou', async () => {
    const gateway = createGateway();
    const context = createContext();
    const service = createManualPushService(gateway, context, {
      getSession: vi.fn().mockResolvedValue(null),
    });

    const result = await service.push({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      isOnline: true,
    });

    expect(result.message).toMatch(/sessao terminou/);
    expect(context.validateMembership).not.toHaveBeenCalled();
    expect(gateway.push).not.toHaveBeenCalled();
  });

  it('bloqueia offline sem validar membership ou chamar gateway', async () => {
    const gateway = createGateway();
    const context = createContext();
    const service = createTestService(gateway, context);
    const result = await service.push({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      isOnline: false,
    });
    expect(result.message).toMatch(/Conecte-se/);
    expect(context.validateMembership).not.toHaveBeenCalled();
    expect(gateway.push).not.toHaveBeenCalled();
  });

  it('bloqueia membership invalida sem chamada de escrita remota', async () => {
    const gateway = createGateway();
    const context = createContext(false);
    const service = createTestService(gateway, context);
    const result = await service.push({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      isOnline: true,
    });
    expect(result.message).toMatch(/nao pertence mais/);
    expect(gateway.push).not.toHaveBeenCalled();
  });

  it('nao processa evento sem businessId', async () => {
    const entry = categoryEntry({ businessId: undefined, userId: undefined });
    await localDb.outbox.add(entry);
    const gateway = createGateway();
    const service = createTestService(gateway, createContext());

    const result = await service.push({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    expect(result).toMatchObject({ claimed: 0, succeeded: 0, failed: 0 });
    expect(gateway.push).not.toHaveBeenCalled();
    expect(await localDb.outbox.get(entry.id)).toMatchObject({ status: 'pending' });
  });

  it('associa eventos device-scoped em acao separada sem enviar', async () => {
    const entry = categoryEntry({ businessId: undefined, userId: undefined, status: 'error' });
    await localDb.outbox.add({ ...entry, lastError: 'contexto ausente', nextAttemptAt: '2030-01-01T00:00:00.000Z' });
    const gateway = createGateway();
    const service = createTestService(gateway, createContext());

    const result = await service.bindLocalEvents({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      isOnline: true,
      now: () => new Date('2026-07-19T12:00:00.000Z'),
    });

    expect(result).toMatchObject({ status: 'completed', bound: 1 });
    expect(gateway.push).not.toHaveBeenCalled();
    expect(await localDb.outbox.get(entry.id)).toMatchObject({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      status: 'pending',
      lastError: undefined,
      nextAttemptAt: undefined,
    });
  });

  it('envia categoria suportada e arquiva sucesso com versao remota', async () => {
    const entry = categoryEntry();
    await localDb.outbox.add(entry);
    const gateway = createGateway();
    const service = createTestService(gateway, createContext());

    const result = await service.push({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    expect(result).toMatchObject({ status: 'completed', succeeded: 1, failed: 0 });
    expect(await localDb.outbox.get(entry.id)).toMatchObject({
      status: 'synced',
      remoteVersion: 1,
    });
  });

  it('usa versao do ultimo sucesso para update otimista', async () => {
    const synced = categoryEntry({ status: 'synced', remoteVersion: 3 });
    const update = categoryEntry({
      id: '77777777-7777-4777-8777-777777777777',
      operation: 'category.updated',
      createdAt: '2026-07-19T11:00:00.000Z',
    });
    await localDb.outbox.bulkAdd([synced, update]);
    const gateway = createGateway();
    gateway.push.mockResolvedValue({ remoteVersion: 4, wasDuplicate: false });
    const service = createTestService(gateway, createContext());

    await service.push({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    expect(gateway.push).toHaveBeenCalledWith(expect.objectContaining({ id: update.id }), 3);
    expect(await localDb.outbox.get(update.id)).toMatchObject({ status: 'synced', remoteVersion: 4 });
  });

  it('usa a maior versao arquivada mesmo quando timestamps de sucesso empatam', async () => {
    const first = categoryEntry({ status: 'synced', remoteVersion: 1 });
    const second = categoryEntry({
      id: '99999999-9999-4999-8999-999999999999',
      status: 'synced',
      remoteVersion: 2,
      updatedAt: first.updatedAt,
    });
    const update = categoryEntry({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      operation: 'category.updated',
      createdAt: '2026-07-19T12:00:00.000Z',
    });
    await localDb.outbox.bulkAdd([first, second, update]);
    const gateway = createGateway();
    gateway.push.mockResolvedValue({ remoteVersion: 3, wasDuplicate: false });
    const service = createTestService(gateway, createContext());

    await service.push({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    expect(gateway.push).toHaveBeenCalledWith(expect.objectContaining({ id: update.id }), 2);
  });

  it('bloqueia update historico sem versao remota e mantem erro local', async () => {
    const update = categoryEntry({ operation: 'category.updated' });
    await localDb.outbox.add(update);
    const gateway = createGateway();
    const service = createTestService(gateway, createContext());

    const result = await service.push({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    expect(result.failed).toBe(1);
    expect(gateway.push).not.toHaveBeenCalled();
    expect(await localDb.outbox.get(update.id)).toMatchObject({
      status: 'error',
      lastError: expect.stringMatching(/versao remota segura/),
    });
  });

  it('bloqueia movement.created sem chamada remota e aplica backoff', async () => {
    const movement = movementEntry();
    await localDb.outbox.add(movement);
    const before = Date.now();
    const gateway = createGateway();
    const service = createTestService(gateway, createContext());

    const result = await service.push({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    const persisted = await localDb.outbox.get(movement.id);
    expect(result.failed).toBe(1);
    expect(gateway.push).not.toHaveBeenCalled();
    expect(persisted).toMatchObject({ status: 'error', attemptCount: 1 });
    expect(Date.parse(persisted?.nextAttemptAt ?? '')).toBeGreaterThan(before);
  });

  it('falha remota usa backoff e remove segredo de lastError', async () => {
    const entry = categoryEntry();
    await localDb.outbox.add(entry);
    const gateway = createGateway();
    gateway.push.mockRejectedValue(new Error('password=segredo authorization bearer token=abc'));
    const service = createTestService(gateway, createContext());

    await service.push({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    const persisted = await localDb.outbox.get(entry.id);
    expect(persisted).toMatchObject({ status: 'error', attemptCount: 1 });
    expect(persisted?.lastError).not.toMatch(/password|segredo|authorization|bearer|token|abc/i);
    expect(persisted?.nextAttemptAt).toBeTruthy();
  });

  it('respeita ordem do batch para eventos vinculados', async () => {
    const later = categoryEntry({ id: 'b', createdAt: '2026-07-19T11:00:00.000Z' });
    const earlier = categoryEntry({ id: 'a', createdAt: '2026-07-19T10:00:00.000Z' });
    await localDb.outbox.bulkAdd([later, earlier]);
    const order: string[] = [];
    const gateway = createGateway();
    gateway.push.mockImplementation(async (entry) => {
      order.push(entry.id);
      return { remoteVersion: 1, wasDuplicate: false };
    });
    const service = createTestService(gateway, createContext());

    await service.push({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });
    expect(order).toEqual(['a', 'b']);
  });

  it('nao reivindica evento vinculado a outra conta ou estabelecimento', async () => {
    const entry = categoryEntry({
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      businessId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    await localDb.outbox.add(entry);
    const gateway = createGateway();
    const service = createTestService(gateway, createContext());

    await service.push({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    expect(gateway.push).not.toHaveBeenCalled();
    expect(await localDb.outbox.get(entry.id)).toMatchObject({ status: 'pending' });
  });
});

function createTestService(
  gateway: ReturnType<typeof createGateway>,
  context: ReturnType<typeof createContext>,
) {
  return createManualPushService(gateway, context, {
    getSession: vi.fn().mockResolvedValue(createSession()),
  });
}

function createSession(): Session {
  return {
    access_token: 'token-de-teste',
    refresh_token: 'refresh-de-teste',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'pessoa@stockflow.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-07-19T00:00:00.000Z',
    },
  };
}

function createGateway(configured = true) {
  return {
    isConfigured: vi.fn<SyncRemoteGateway['isConfigured']>().mockReturnValue(configured),
    push: vi.fn<SyncRemoteGateway['push']>().mockResolvedValue({
      remoteVersion: 1,
      wasDuplicate: false,
    }),
  };
}

function createContext(validMembership = true) {
  return {
    isConfigured: vi.fn<BusinessContextService['isConfigured']>().mockReturnValue(true),
    listAvailable: vi.fn<BusinessContextService['listAvailable']>().mockResolvedValue([]),
    validateMembership: vi
      .fn<BusinessContextService['validateMembership']>()
      .mockResolvedValue(validMembership),
    select: vi.fn<BusinessContextService['select']>().mockResolvedValue(undefined),
    getSelected: vi.fn<BusinessContextService['getSelected']>(),
    clearSelected: vi.fn<BusinessContextService['clearSelected']>(),
  };
}

function categoryEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  const createdAt = overrides.createdAt ?? '2026-07-19T10:00:00.000Z';
  return {
    id: crypto.randomUUID(),
    entityType: 'category',
    entityId: '33333333-3333-4333-8333-333333333333',
    operation: 'category.created',
    payload: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Bebidas',
      createdAt,
      updatedAt: createdAt,
      syncStatus: 'pending',
    },
    status: 'pending',
    attemptCount: 0,
    createdAt,
    updatedAt: createdAt,
    userId: USER_ID,
    businessId: BUSINESS_ID,
    idempotencyKey: `event:${crypto.randomUUID()}`,
    ...overrides,
  };
}

function movementEntry(): OutboxEntry {
  const createdAt = '2026-07-19T10:00:00.000Z';
  return {
    id: crypto.randomUUID(),
    entityType: 'movement',
    entityId: '88888888-8888-4888-8888-888888888888',
    operation: 'movement.created',
    payload: {
      id: '88888888-8888-4888-8888-888888888888',
      productId: '44444444-4444-4444-8444-444444444444',
      type: 'entrada',
      quantity: 2,
      note: '',
      date: createdAt,
      previousQuantity: 5,
      resultingQuantity: 7,
      isLegacy: false,
      syncStatus: 'pending',
    },
    status: 'pending',
    attemptCount: 0,
    createdAt,
    updatedAt: createdAt,
    userId: USER_ID,
    businessId: BUSINESS_ID,
    idempotencyKey: `event:${crypto.randomUUID()}`,
  };
}
