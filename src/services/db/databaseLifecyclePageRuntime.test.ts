// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StockFlowDatabase } from './localDb';
import {
  DATABASE_UPGRADE_BLOCKED_MESSAGE,
  DatabaseLifecycleManager,
} from './databaseLifecycle';
import { DatabaseLifecyclePageRuntime } from './databaseLifecyclePageRuntime';

class FakeBroadcastChannel extends EventTarget {
  postMessage = vi.fn();
  close = vi.fn();

  receive(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

const databaseNames: string[] = [];

function createPageTransitionEvent(type: 'pagehide' | 'pageshow', persisted: boolean) {
  const event = new Event(type);
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function createRuntime() {
  const databaseName = `stockflow-page-lifecycle-${crypto.randomUUID()}`;
  databaseNames.push(databaseName);
  const database = new StockFlowDatabase(databaseName);
  const channels: FakeBroadcastChannel[] = [];
  const createChannel = vi.fn(() => {
    const channel = new FakeBroadcastChannel();
    channels.push(channel);
    return channel;
  });
  const manager = new DatabaseLifecycleManager({
    database,
    reload: vi.fn(),
    createBroadcastChannel: createChannel,
  });
  const page = new EventTarget();
  const runtime = new DatabaseLifecyclePageRuntime({ database, manager, page });

  return { database, manager, page, runtime, channels, createChannel };
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe('DatabaseLifecyclePageRuntime', () => {
  it('inicia somente um monitor, um conjunto de listeners e um canal', () => {
    const { runtime, page, channels, createChannel } = createRuntime();
    const addEventListener = vi.spyOn(page, 'addEventListener');

    runtime.start();
    runtime.start();

    expect(createChannel).toHaveBeenCalledOnce();
    expect(channels).toHaveLength(1);
    expect(
      addEventListener.mock.calls.filter(([eventName]) => eventName === 'pagehide'),
    ).toHaveLength(1);
    runtime.dispose();
    expect(channels[0]?.close).toHaveBeenCalledOnce();
  });

  it('faz cleanup e fecha o banco em pagehide sem BFCache', async () => {
    const { database, manager, page, runtime, channels, createChannel } = createRuntime();
    await database.open();
    runtime.start();

    page.dispatchEvent(createPageTransitionEvent('pagehide', false));

    expect(database.isOpen()).toBe(false);
    expect(channels[0]?.close).toHaveBeenCalledOnce();
    page.dispatchEvent(createPageTransitionEvent('pageshow', false));
    await runtime.whenRestored();
    expect(database.isOpen()).toBe(false);
    expect(createChannel).toHaveBeenCalledOnce();
    expect(manager.getState().status).toBe('normal');
    runtime.dispose();
  });

  it('reabre explicitamente o banco e preserva os dados após retorno pelo BFCache', async () => {
    const { database, page, runtime, channels } = createRuntime();
    const categoryId = crypto.randomUUID();
    const now = '2026-07-15T12:00:00.000Z';
    await database.open();
    await database.categories.add({
      id: categoryId,
      name: 'Persistida',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    runtime.start();

    page.dispatchEvent(createPageTransitionEvent('pagehide', true));
    expect(database.isOpen()).toBe(false);
    expect(channels[0]?.close).toHaveBeenCalledOnce();

    page.dispatchEvent(createPageTransitionEvent('pageshow', true));
    await runtime.whenRestored();

    expect(database.isOpen()).toBe(true);
    expect(await database.categories.get(categoryId)).toMatchObject({
      id: categoryId,
      name: 'Persistida',
    });
    runtime.dispose();
    database.close();
  });

  it('não acumula handlers ou canais em ciclos repetidos de BFCache', async () => {
    const { database, page, runtime, channels, createChannel } = createRuntime();
    const addEventListener = vi.spyOn(page, 'addEventListener');
    await database.open();
    runtime.start();

    for (let cycle = 0; cycle < 2; cycle += 1) {
      page.dispatchEvent(createPageTransitionEvent('pagehide', true));
      page.dispatchEvent(createPageTransitionEvent('pageshow', true));
      await runtime.whenRestored();
      page.dispatchEvent(createPageTransitionEvent('pageshow', true));
    }

    expect(createChannel).toHaveBeenCalledTimes(3);
    expect(channels).toHaveLength(3);
    expect(channels[0]?.close).toHaveBeenCalledOnce();
    expect(channels[1]?.close).toHaveBeenCalledOnce();
    expect(channels[2]?.close).not.toHaveBeenCalled();
    expect(
      addEventListener.mock.calls.filter(([eventName]) => eventName === 'pagehide'),
    ).toHaveLength(3);
    runtime.dispose();
    database.close();
    expect(channels[2]?.close).toHaveBeenCalledOnce();
  });

  it('não reabre o banco após versionchange e mantém reload-required', async () => {
    const { database, manager, page, runtime, channels, createChannel } = createRuntime();
    await database.open();
    runtime.start();
    database.on.versionchange.fire(
      new IDBVersionChangeEvent('versionchange', { oldVersion: 90, newVersion: 100 }),
    );

    page.dispatchEvent(createPageTransitionEvent('pagehide', true));
    page.dispatchEvent(createPageTransitionEvent('pageshow', true));
    await runtime.whenRestored();

    expect(manager.getState().status).toBe('reload-required');
    expect(database.isOpen()).toBe(false);
    expect(createChannel).toHaveBeenCalledOnce();
    expect(channels[0]?.close).toHaveBeenCalledOnce();
    await expect(database.products.count()).rejects.toMatchObject({
      name: 'DatabaseClosedError',
    });
    runtime.dispose();
  });

  it('não reabre após DATABASE_UPGRADE_BLOCKED recebido de outra aba', async () => {
    const { database, manager, page, runtime, channels, createChannel } = createRuntime();
    await database.open();
    runtime.start();
    channels[0]?.receive(DATABASE_UPGRADE_BLOCKED_MESSAGE);

    page.dispatchEvent(createPageTransitionEvent('pagehide', true));
    page.dispatchEvent(createPageTransitionEvent('pageshow', true));
    await runtime.whenRestored();

    expect(manager.getState().status).toBe('reload-required');
    expect(database.isOpen()).toBe(false);
    expect(createChannel).toHaveBeenCalledOnce();
    expect(channels[0]?.close).toHaveBeenCalledOnce();
    await expect(database.products.count()).rejects.toMatchObject({
      name: 'DatabaseClosedError',
    });
    runtime.dispose();
  });

  it('converte falha de reabertura após BFCache em reload-required', async () => {
    const { database, manager, page, runtime } = createRuntime();
    await database.open();
    runtime.start();
    const open = vi.spyOn(database, 'open').mockRejectedValueOnce(new Error('falha controlada'));

    page.dispatchEvent(createPageTransitionEvent('pagehide', true));
    page.dispatchEvent(createPageTransitionEvent('pageshow', true));
    await runtime.whenRestored();

    expect(open).toHaveBeenCalledOnce();
    expect(manager.getState().status).toBe('reload-required');
    expect(database.isOpen()).toBe(false);
    runtime.dispose();
  });

  it('fecha uma abertura pendente que se torna obsoleta por reload-required', async () => {
    const { database, manager, page, runtime, channels } = createRuntime();
    await database.open();
    runtime.start();
    const deferredOpen = createDeferred();
    const originalOpen = database.open.bind(database);
    const open = vi.spyOn(database, 'open').mockImplementation(
      () =>
        deferredOpen.promise.then(() => originalOpen()) as ReturnType<
          typeof database.open
        >,
    );

    page.dispatchEvent(createPageTransitionEvent('pagehide', true));
    page.dispatchEvent(createPageTransitionEvent('pageshow', true));
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());

    manager.requireReload();
    expect(manager.getState().status).toBe('reload-required');
    deferredOpen.resolve();
    await runtime.whenRestored();

    expect(manager.getState().status).toBe('reload-required');
    expect(database.isOpen()).toBe(false);
    expect(channels[1]?.close).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it('fecha uma abertura pendente invalidada por novo pagehide', async () => {
    const { database, manager, page, runtime, channels } = createRuntime();
    await database.open();
    runtime.start();
    const deferredOpen = createDeferred();
    const originalOpen = database.open.bind(database);
    const open = vi.spyOn(database, 'open').mockImplementation(
      () =>
        deferredOpen.promise.then(() => originalOpen()) as ReturnType<
          typeof database.open
        >,
    );

    page.dispatchEvent(createPageTransitionEvent('pagehide', true));
    page.dispatchEvent(createPageTransitionEvent('pageshow', true));
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());

    page.dispatchEvent(createPageTransitionEvent('pagehide', true));
    expect(channels[1]?.close).toHaveBeenCalledOnce();
    deferredOpen.resolve();
    await runtime.whenRestored();

    expect(manager.getState().status).toBe('normal');
    expect(database.isOpen()).toBe(false);
    runtime.dispose();
  });

  it('ignora rejeição de uma abertura invalidada sem criar reload-required', async () => {
    const { database, manager, page, runtime } = createRuntime();
    await database.open();
    runtime.start();
    const deferredOpen = createDeferred();
    const open = vi.spyOn(database, 'open').mockImplementation(
      () => deferredOpen.promise as unknown as ReturnType<typeof database.open>,
    );

    page.dispatchEvent(createPageTransitionEvent('pagehide', true));
    page.dispatchEvent(createPageTransitionEvent('pageshow', true));
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());

    page.dispatchEvent(createPageTransitionEvent('pagehide', false));
    deferredOpen.reject(new Error('falha obsoleta'));
    await runtime.whenRestored();

    expect(manager.getState().status).toBe('normal');
    expect(database.isOpen()).toBe(false);
    runtime.dispose();
  });

  it('fecha uma abertura pendente invalidada por dispose', async () => {
    const { database, manager, page, runtime, channels } = createRuntime();
    await database.open();
    runtime.start();
    const deferredOpen = createDeferred();
    const originalOpen = database.open.bind(database);
    const open = vi.spyOn(database, 'open').mockImplementation(
      () =>
        deferredOpen.promise.then(() => originalOpen()) as ReturnType<
          typeof database.open
        >,
    );

    page.dispatchEvent(createPageTransitionEvent('pagehide', true));
    page.dispatchEvent(createPageTransitionEvent('pageshow', true));
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());

    runtime.dispose();
    expect(channels[1]?.close).toHaveBeenCalledOnce();
    deferredOpen.resolve();
    await runtime.whenRestored();

    expect(manager.getState().status).toBe('normal');
    expect(database.isOpen()).toBe(false);
  });
});
