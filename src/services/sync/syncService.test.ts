import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboxEntry, OutboxStatus } from '../../types/Sync';
import { localDb } from '../db/localDb';
import {
  MAX_OUTBOX_BACKOFF_MS,
  calculateNextAttemptAt,
  processOutboxBatch,
  resetStaleProcessing,
  sanitizeOutboxError,
} from './syncService';

const BASE_TIME = new Date('2026-07-19T12:00:00.000Z');

function createEntry({
  id = crypto.randomUUID(),
  status = 'pending',
  createdAt = '2026-07-19T10:00:00.000Z',
  updatedAt = createdAt,
  attemptCount = 0,
  nextAttemptAt,
}: Partial<OutboxEntry> & { status?: OutboxStatus } = {}): OutboxEntry {
  return {
    id,
    entityType: 'category',
    entityId: crypto.randomUUID(),
    operation: 'category.created',
    payload: {
      id: crypto.randomUUID(),
      name: 'Bebidas',
      createdAt,
      updatedAt,
      syncStatus: 'pending',
    },
    status,
    attemptCount,
    createdAt,
    updatedAt,
    nextAttemptAt,
    idempotencyKey: `test:${id}`,
  };
}

async function addEntries(...entries: OutboxEntry[]): Promise<void> {
  await localDb.outbox.bulkAdd(entries);
}

describe('processamento local da outbox', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('seleciona evento pending elegivel', async () => {
    const entry = createEntry();
    await addEntries(entry);
    const executor = vi.fn().mockResolvedValue(undefined);

    const result = await processOutboxBatch({ executor, now: () => BASE_TIME });

    expect(result).toEqual({ claimed: 1, succeeded: 1, failed: 0 });
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({ id: entry.id }));
  });

  it('nao seleciona evento synced', async () => {
    await addEntries(createEntry({ status: 'synced' }));
    const executor = vi.fn();

    expect(await processOutboxBatch({ executor, now: () => BASE_TIME })).toEqual({
      claimed: 0,
      succeeded: 0,
      failed: 0,
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it('nao seleciona evento conflict', async () => {
    await addEntries(createEntry({ status: 'conflict' }));
    const executor = vi.fn();

    await processOutboxBatch({ executor, now: () => BASE_TIME });

    expect(executor).not.toHaveBeenCalled();
  });

  it('nao seleciona evento processing recente', async () => {
    await addEntries(createEntry({ status: 'processing', updatedAt: BASE_TIME.toISOString() }));
    const executor = vi.fn();

    await processOutboxBatch({ executor, now: () => BASE_TIME });

    expect(executor).not.toHaveBeenCalled();
  });

  it('seleciona error quando nextAttemptAt ja venceu', async () => {
    const entry = createEntry({
      status: 'error',
      nextAttemptAt: '2026-07-19T11:59:59.000Z',
    });
    await addEntries(entry);
    const executor = vi.fn().mockResolvedValue(undefined);

    await processOutboxBatch({ executor, now: () => BASE_TIME });

    expect(executor).toHaveBeenCalledWith(expect.objectContaining({ id: entry.id }));
  });

  it('nao seleciona error com nextAttemptAt futuro', async () => {
    await addEntries(
      createEntry({ status: 'error', nextAttemptAt: '2026-07-19T12:00:01.000Z' }),
    );
    const executor = vi.fn();

    await processOutboxBatch({ executor, now: () => BASE_TIME });

    expect(executor).not.toHaveBeenCalled();
  });

  it('ordena deterministicamente por createdAt e id', async () => {
    await addEntries(
      createEntry({ id: 'c', createdAt: '2026-07-19T10:00:00.000Z' }),
      createEntry({ id: 'b', createdAt: '2026-07-19T09:00:00.000Z' }),
      createEntry({ id: 'a', createdAt: '2026-07-19T10:00:00.000Z' }),
    );
    const executionOrder: string[] = [];

    await processOutboxBatch({
      executor: async (entry) => {
        executionOrder.push(entry.id);
      },
      now: () => BASE_TIME,
    });

    expect(executionOrder).toEqual(['b', 'a', 'c']);
  });

  it('respeita batchSize sem processar toda a fila', async () => {
    await addEntries(createEntry(), createEntry(), createEntry());
    const executor = vi.fn().mockResolvedValue(undefined);

    const result = await processOutboxBatch({ executor, now: () => BASE_TIME, batchSize: 2 });

    expect(result.claimed).toBe(2);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(await localDb.outbox.count()).toBe(1);
  });

  it('marca item como processing antes de chamar o executor', async () => {
    const entry = createEntry();
    await addEntries(entry);

    await processOutboxBatch({
      executor: async (claimedEntry) => {
        expect(claimedEntry.status).toBe('processing');
        expect(await localDb.outbox.get(entry.id)).toMatchObject({ status: 'processing' });
      },
      now: () => BASE_TIME,
    });
  });

  it('remove o evento quando o executor injetado confirma sucesso', async () => {
    const entry = createEntry();
    await addEntries(entry);

    await processOutboxBatch({ executor: async () => undefined, now: () => BASE_TIME });

    expect(await localDb.outbox.get(entry.id)).toBeUndefined();
  });

  it('registra status error quando o executor falha', async () => {
    const entry = createEntry();
    await addEntries(entry);

    await processOutboxBatch({
      executor: async () => {
        throw new Error('Servico indisponivel');
      },
      now: () => BASE_TIME,
    });

    expect(await localDb.outbox.get(entry.id)).toMatchObject({ status: 'error' });
  });

  it('incrementa attemptCount somente depois da falha', async () => {
    const entry = createEntry({ attemptCount: 2 });
    await addEntries(entry);

    await processOutboxBatch({
      executor: async (claimedEntry) => {
        expect(claimedEntry.attemptCount).toBe(2);
        throw new Error('Falha');
      },
      now: () => BASE_TIME,
    });

    expect((await localDb.outbox.get(entry.id))?.attemptCount).toBe(3);
  });

  it('armazena lastError curto sem stack trace', async () => {
    const entry = createEntry();
    await addEntries(entry);

    await processOutboxBatch({
      executor: async () => {
        const error = new Error('Falha objetiva');
        error.stack = `${error.message}\n${'linha de stack '.repeat(100)}`;
        throw error;
      },
      now: () => BASE_TIME,
    });

    expect((await localDb.outbox.get(entry.id))?.lastError).toBe('Falha objetiva');
  });

  it('define nextAttemptAt futuro depois da falha', async () => {
    const entry = createEntry();
    await addEntries(entry);

    await processOutboxBatch({
      executor: async () => Promise.reject(new Error('Falha')),
      now: () => BASE_TIME,
    });

    expect((await localDb.outbox.get(entry.id))?.nextAttemptAt).toBe(
      '2026-07-19T12:01:00.000Z',
    );
  });

  it('omite senha e token do lastError persistido', async () => {
    const entry = createEntry();
    await addEntries(entry);

    await processOutboxBatch({
      executor: async () => Promise.reject(new Error('password=segredo token=abc123')),
      now: () => BASE_TIME,
    });

    const lastError = (await localDb.outbox.get(entry.id))?.lastError ?? '';
    expect(lastError).not.toMatch(/password|segredo|token|abc123/i);
    expect(lastError).toMatch(/detalhes sensiveis foram omitidos/i);
  });

  it('impede duas chamadas concorrentes de executar o mesmo item', async () => {
    const entry = createEntry();
    await addEntries(entry);
    let releaseExecutor: (() => void) | undefined;
    let notifyStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseExecutor = resolve;
    });
    const executor = vi.fn(async () => {
      notifyStarted?.();
      await blocked;
    });

    const firstRun = processOutboxBatch({ executor, now: () => BASE_TIME });
    await started;
    const secondResult = await processOutboxBatch({ executor, now: () => BASE_TIME });
    releaseExecutor?.();
    await firstRun;

    expect(secondResult.claimed).toBe(0);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('rejeita batchSize sem limite seguro', async () => {
    await expect(
      processOutboxBatch({ executor: async () => undefined, batchSize: 101 }),
    ).rejects.toThrow(/batchSize/);
  });
});

describe('backoff local da outbox', () => {
  it('agenda a primeira falha para um minuto no futuro', () => {
    expect(calculateNextAttemptAt(1, BASE_TIME)).toBe('2026-07-19T12:01:00.000Z');
  });

  it('aumenta a espera nas falhas seguintes', () => {
    const delays = [1, 2, 3, 4].map(
      (attemptCount) => Date.parse(calculateNextAttemptAt(attemptCount, BASE_TIME)) - BASE_TIME.getTime(),
    );

    expect(delays).toEqual([60_000, 300_000, 900_000, 1_800_000]);
  });

  it('respeita o teto maximo de uma hora', () => {
    const nextAttempt = Date.parse(calculateNextAttemptAt(9_999, BASE_TIME));
    expect(nextAttempt - BASE_TIME.getTime()).toBe(MAX_OUTBOX_BACKOFF_MS);
  });

  it('usa relogio injetado de forma deterministica no processamento', async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
    const entry = createEntry();
    await addEntries(entry);

    await processOutboxBatch({
      executor: async () => Promise.reject(new Error('Falha')),
      now: () => new Date('2030-02-03T04:05:06.000Z'),
    });

    expect((await localDb.outbox.get(entry.id))?.nextAttemptAt).toBe(
      '2030-02-03T04:06:06.000Z',
    );
  });

  it('nao produz data invalida quando o relogio e invalido', () => {
    expect(() => calculateNextAttemptAt(1, new Date('invalida'))).toThrow(/relogio/);
  });

  it('normaliza attemptCount corrompido sem produzir NaN ou Infinity', async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
    const entry = createEntry({ attemptCount: Number.NaN });
    await addEntries(entry);

    await processOutboxBatch({
      executor: async () => Promise.reject(new Error('Falha')),
      now: () => BASE_TIME,
    });

    const persistedAttemptCount = (await localDb.outbox.get(entry.id))?.attemptCount;
    expect(persistedAttemptCount).toBe(1);
    expect(Number.isFinite(persistedAttemptCount)).toBe(true);
  });

  it('sanitiza mensagens desconhecidas e limita mensagens extensas', () => {
    expect(sanitizeOutboxError({ reason: 'sem mensagem segura' })).toMatch(/desconhecida/);
    expect(sanitizeOutboxError('x'.repeat(500)).length).toBeLessThanOrEqual(240);
  });
});

describe('reset de processing travado', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  it('recupera processing mais antigo que o limite', async () => {
    const entry = createEntry({ status: 'processing', updatedAt: '2026-07-19T10:00:00.000Z' });
    await addEntries(entry);

    expect(
      await resetStaleProcessing({
        olderThan: new Date('2026-07-19T11:00:00.000Z'),
        now: () => BASE_TIME,
      }),
    ).toBe(1);
    expect(await localDb.outbox.get(entry.id)).toMatchObject({ status: 'pending' });
  });

  it('preserva processing recente', async () => {
    const entry = createEntry({ status: 'processing', updatedAt: '2026-07-19T11:30:00.000Z' });
    await addEntries(entry);

    await resetStaleProcessing({
      olderThan: new Date('2026-07-19T11:00:00.000Z'),
      now: () => BASE_TIME,
    });

    expect(await localDb.outbox.get(entry.id)).toMatchObject({ status: 'processing' });
  });

  it.each<OutboxStatus>(['pending', 'error', 'synced', 'conflict'])(
    'nao afeta evento %s',
    async (status) => {
      const entry = createEntry({ status, updatedAt: '2026-07-19T10:00:00.000Z' });
      await addEntries(entry);

      await resetStaleProcessing({
        olderThan: new Date('2026-07-19T11:00:00.000Z'),
        now: () => BASE_TIME,
      });

      expect(await localDb.outbox.get(entry.id)).toMatchObject({ status });
    },
  );

  it('atualiza updatedAt, registra recuperacao e libera retry imediato', async () => {
    const entry = createEntry({
      status: 'processing',
      updatedAt: '2026-07-19T10:00:00.000Z',
      nextAttemptAt: '2026-07-20T10:00:00.000Z',
    });
    await addEntries(entry);

    await resetStaleProcessing({
      olderThan: new Date('2026-07-19T11:00:00.000Z'),
      now: () => BASE_TIME,
    });

    expect(await localDb.outbox.get(entry.id)).toMatchObject({
      updatedAt: BASE_TIME.toISOString(),
      lastError: expect.stringMatching(/recolocado na fila/),
      nextAttemptAt: undefined,
    });
  });

  it('nao duplica eventos ao recuperar processing antigo', async () => {
    await addEntries(
      createEntry({ status: 'processing', updatedAt: '2026-07-19T10:00:00.000Z' }),
      createEntry({ status: 'pending' }),
    );

    await resetStaleProcessing({
      olderThan: new Date('2026-07-19T11:00:00.000Z'),
      now: () => BASE_TIME,
    });

    expect(await localDb.outbox.count()).toBe(2);
    expect(await localDb.outbox.where('status').equals('pending').count()).toBe(2);
  });
});
