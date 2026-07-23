import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { BusinessContextService } from '../businessContextService';
import { localDb } from '../db/localDb';
import { createManualPullService } from './manualPullService';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';

describe('bloqueio planejado do pull manual', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('bloqueia sem Supabase configurado', async () => {
    const context = createContext();
    context.isConfigured.mockReturnValue(false);
    const service = createService(context);

    const result = await service.check({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    expect(result).toMatchObject({ status: 'blocked', reason: 'supabase-unconfigured' });
    expect(context.validateMembership).not.toHaveBeenCalled();
  });

  it('bloqueia sem sessao informada', async () => {
    const context = createContext();
    const sessionService = { getSession: vi.fn().mockResolvedValue(createSession()) };
    const service = createManualPullService(context, sessionService);

    const result = await service.check({ businessId: BUSINESS_ID, isOnline: true });

    expect(result.reason).toBe('session-required');
    expect(sessionService.getSession).not.toHaveBeenCalled();
  });

  it('bloqueia sem estabelecimento selecionado', async () => {
    const context = createContext();
    const service = createService(context);

    const result = await service.check({ userId: USER_ID, isOnline: true });

    expect(result.reason).toBe('business-required');
    expect(context.validateMembership).not.toHaveBeenCalled();
  });

  it('bloqueia offline antes de consultar sessao ou membership', async () => {
    const context = createContext();
    const sessionService = { getSession: vi.fn().mockResolvedValue(createSession()) };
    const service = createManualPullService(context, sessionService);

    const result = await service.check({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: false });

    expect(result.reason).toBe('offline');
    expect(sessionService.getSession).not.toHaveBeenCalled();
    expect(context.validateMembership).not.toHaveBeenCalled();
  });

  it('bloqueia quando a sessao terminou ou pertence a outra conta', async () => {
    const context = createContext();
    const expired = createManualPullService(context, { getSession: vi.fn().mockResolvedValue(null) });
    const otherAccount = createManualPullService(context, {
      getSession: vi.fn().mockResolvedValue(createSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
    });

    await expect(expired.check({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true }))
      .resolves.toMatchObject({ reason: 'session-ended' });
    await expect(otherAccount.check({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true }))
      .resolves.toMatchObject({ reason: 'session-mismatch' });
    expect(context.validateMembership).not.toHaveBeenCalled();
  });

  it('bloqueia membership invalida', async () => {
    const context = createContext(false);
    const service = createService(context);

    const result = await service.check({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    expect(result.reason).toBe('membership-invalid');
    expect(context.validateMembership).toHaveBeenCalledWith(USER_ID, BUSINESS_ID);
  });

  it('com todos os pre-requisitos bloqueia pelo runtime local incompleto e nao baixa dados', async () => {
    const context = createContext();
    const service = createService(context);

    const result = await service.check({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      reason: 'local-runtime-scope-required',
      downloaded: 0,
      applied: 0,
      ignored: 0,
    }));
    expect(result.message).toMatch(/runtime principal ainda nao filtra todas as telas/i);
    expect(result.message).toMatch(/carga inicial/i);
    expect(result.message).toMatch(/cursor/i);
    expect(result.message).not.toMatch(/nao estao separados por estabelecimento|businessId/i);
  });

  it('nao altera nem remove a outbox local', async () => {
    const entry = {
      id: crypto.randomUUID(),
      entityType: 'category' as const,
      entityId: crypto.randomUUID(),
      operation: 'category.created' as const,
      payload: {
        id: crypto.randomUUID(),
        name: 'Bebidas',
        createdAt: '2026-07-22T10:00:00.000Z',
        updatedAt: '2026-07-22T10:00:00.000Z',
        syncStatus: 'pending' as const,
      },
      status: 'pending' as const,
      attemptCount: 0,
      createdAt: '2026-07-22T10:00:00.000Z',
      updatedAt: '2026-07-22T10:00:00.000Z',
      idempotencyKey: crypto.randomUUID(),
    };
    await localDb.outbox.add(entry);
    const service = createService(createContext());

    await service.check({ userId: USER_ID, businessId: BUSINESS_ID, isOnline: true });

    expect(await localDb.outbox.toArray()).toEqual([entry]);
  });
});

function createService(context: ReturnType<typeof createContext>) {
  return createManualPullService(context, { getSession: vi.fn().mockResolvedValue(createSession()) });
}

function createContext(validMembership = true) {
  return {
    isConfigured: vi.fn<BusinessContextService['isConfigured']>().mockReturnValue(true),
    listAvailable: vi.fn<BusinessContextService['listAvailable']>().mockResolvedValue([]),
    validateMembership: vi.fn<BusinessContextService['validateMembership']>().mockResolvedValue(validMembership),
    select: vi.fn<BusinessContextService['select']>().mockResolvedValue(undefined),
    getSelected: vi.fn<BusinessContextService['getSelected']>(),
    clearSelected: vi.fn<BusinessContextService['clearSelected']>(),
  };
}

function createSession(userId = USER_ID): Session {
  return {
    access_token: 'token-de-teste',
    refresh_token: 'refresh-de-teste',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'pessoa@stockflow.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-07-22T00:00:00.000Z',
    },
  };
}
