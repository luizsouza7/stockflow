import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StockFlowDatabase } from './localDb';
import {
  DATABASE_LIFECYCLE_CHANNEL_NAME,
  DATABASE_UPGRADE_BLOCKED_MESSAGE,
  DatabaseLifecycleManager,
  type DatabaseLifecycleState,
} from './databaseLifecycle';

class FakeBroadcastChannel extends EventTarget {
  postMessage = vi.fn();
  close = vi.fn();

  receive(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

const databaseNames: string[] = [];
const managers: DatabaseLifecycleManager[] = [];

function createTestDatabase() {
  const databaseName = `stockflow-lifecycle-${crypto.randomUUID()}`;
  databaseNames.push(databaseName);
  return new StockFlowDatabase(databaseName);
}

function versionChangeEvent() {
  return new IDBVersionChangeEvent('versionchange', {
    oldVersion: 90,
    newVersion: 100,
  });
}

function createManager(
  database: StockFlowDatabase,
  options: {
    reload?: () => void;
    channel?: FakeBroadcastChannel;
    createChannel?: (name: string) => FakeBroadcastChannel | undefined;
  } = {},
) {
  const manager = new DatabaseLifecycleManager({
    database,
    reload: options.reload ?? vi.fn(),
    createBroadcastChannel:
      options.createChannel ?? (() => options.channel ?? new FakeBroadcastChannel()),
  });
  manager.start();
  managers.push(manager);
  return manager;
}

afterEach(async () => {
  managers.splice(0).forEach((manager) => manager.stop());
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe('DatabaseLifecycleManager', () => {
  it('fecha a conexão antiga e produz estado explícito em versionchange', () => {
    const database = createTestDatabase();
    const close = vi.spyOn(database, 'close');
    const manager = createManager(database);
    const states: DatabaseLifecycleState[] = [];
    const unsubscribe = manager.subscribe((state) => states.push(state));

    database.on.versionchange.fire(versionChangeEvent());

    expect(close).toHaveBeenCalled();
    expect(manager.getState()).toMatchObject({
      status: 'reload-required',
      message:
        'A conexão com o armazenamento local precisa ser reiniciada com segurança. Recarregue esta aba para continuar.',
    });
    expect(states.map(({ status }) => status)).toEqual(['normal', 'reload-required']);
    unsubscribe();
  });

  it('permite reload consciente no máximo uma vez', () => {
    const database = createTestDatabase();
    const reload = vi.fn();
    const manager = createManager(database, { reload });
    const unsubscribe = manager.subscribe(vi.fn());
    database.on.versionchange.fire(versionChangeEvent());

    expect(manager.requestReload()).toBe(true);
    expect(manager.requestReload()).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('não duplica estado nem coordenação diante de eventos repetidos', () => {
    const database = createTestDatabase();
    const channel = new FakeBroadcastChannel();
    const manager = createManager(database, { channel });
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);

    database.on.blocked.fire(versionChangeEvent());
    database.on.blocked.fire(versionChangeEvent());

    expect(listener).toHaveBeenCalledTimes(2);
    expect(channel.postMessage).toHaveBeenCalledOnce();
    expect(channel.postMessage).toHaveBeenCalledWith(DATABASE_UPGRADE_BLOCKED_MESSAGE);
    expect(Object.keys(channel.postMessage.mock.calls[0]?.[0] ?? {})).toEqual(['type']);
    unsubscribe();
  });

  it('explica bloqueio por outra aba sem expor erro técnico cru', () => {
    const database = createTestDatabase();
    const manager = createManager(database);
    const unsubscribe = manager.subscribe(vi.fn());

    database.on.blocked.fire(versionChangeEvent());

    const state = manager.getState();
    expect(state.status).toBe('upgrade-blocked');
    if (state.status === 'upgrade-blocked') {
      expect(state.message).toContain('outra aba do StockFlow');
      expect(state.message).toContain('Feche ou recarregue');
      expect(state.message).not.toMatch(/VersionError|object store|stack/i);
    }
    unsubscribe();
  });

  it('volta ao estado normal quando o upgrade bloqueado consegue abrir', () => {
    const database = createTestDatabase();
    const manager = createManager(database);
    const states: string[] = [];
    const unsubscribe = manager.subscribe((state) => states.push(state.status));
    database.on.blocked.fire(versionChangeEvent());

    database.on.ready.fire(database);

    expect(states).toEqual(['normal', 'upgrade-blocked', 'normal']);
    unsubscribe();
  });

  it('mantém reload-required como estado terminal diante de blocked posterior', () => {
    const database = createTestDatabase();
    const channel = new FakeBroadcastChannel();
    const manager = createManager(database, { channel });
    const states: string[] = [];
    const unsubscribe = manager.subscribe((state) => states.push(state.status));

    database.on.versionchange.fire(versionChangeEvent());
    database.on.blocked.fire(versionChangeEvent());

    expect(manager.getState().status).toBe('reload-required');
    expect(states).toEqual(['normal', 'reload-required']);
    expect(channel.postMessage).not.toHaveBeenCalled();
    unsubscribe();
    manager.stop();
  });

  it('promove upgrade-blocked para reload-required diante de versionchange', () => {
    const database = createTestDatabase();
    const manager = createManager(database);
    const states: string[] = [];
    const unsubscribe = manager.subscribe((state) => states.push(state.status));

    database.on.blocked.fire(versionChangeEvent());
    database.on.versionchange.fire(versionChangeEvent());

    expect(states).toEqual(['normal', 'upgrade-blocked', 'reload-required']);
    unsubscribe();
    manager.stop();
  });

  it('usa um canal específico, trata mensagem conhecida e ignora desconhecida', () => {
    const database = createTestDatabase();
    const close = vi.spyOn(database, 'close');
    const channel = new FakeBroadcastChannel();
    const createChannel = vi.fn(() => channel);
    const manager = createManager(database, { createChannel });
    const unsubscribe = manager.subscribe(vi.fn());

    channel.receive({ type: 'UNKNOWN_COMMAND', productId: 'nao-deve-ser-usado' });
    expect(close).not.toHaveBeenCalled();
    expect(manager.getState().status).toBe('normal');

    channel.receive({ ...DATABASE_UPGRADE_BLOCKED_MESSAGE, productId: 'nao-deve-ser-usado' });
    expect(close).not.toHaveBeenCalled();
    expect(manager.getState().status).toBe('normal');

    channel.receive(DATABASE_UPGRADE_BLOCKED_MESSAGE);
    expect(createChannel).toHaveBeenCalledWith(DATABASE_LIFECYCLE_CHANNEL_NAME);
    expect(close).toHaveBeenCalledOnce();
    expect(manager.getState().status).toBe('reload-required');
    unsubscribe();
  });

  it('mantém apenas um conjunto de listeners e fecha o canal no cleanup explícito', () => {
    const database = createTestDatabase();
    const channel = new FakeBroadcastChannel();
    const createChannel = vi.fn(() => channel);
    const manager = createManager(database, { createChannel });
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const unsubscribeFirst = manager.subscribe(firstListener);
    const unsubscribeSecond = manager.subscribe(secondListener);

    expect(createChannel).toHaveBeenCalledOnce();
    unsubscribeFirst();
    expect(channel.close).not.toHaveBeenCalled();
    unsubscribeSecond();
    expect(channel.close).not.toHaveBeenCalled();
    manager.stop();
    expect(channel.close).toHaveBeenCalledOnce();

    database.on.blocked.fire(versionChangeEvent());
    channel.receive(DATABASE_UPGRADE_BLOCKED_MESSAGE);
    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).toHaveBeenCalledOnce();
    expect(channel.postMessage).not.toHaveBeenCalled();
  });

  it('continua funcional quando BroadcastChannel não está disponível', () => {
    const database = createTestDatabase();
    const manager = createManager(database, { createChannel: () => undefined });
    const unsubscribe = manager.subscribe(vi.fn());

    expect(() => database.on.blocked.fire(versionChangeEvent())).not.toThrow();
    expect(manager.getState().status).toBe('upgrade-blocked');
    unsubscribe();
  });

  it('observa bloqueio real e liberação com duas conexões IndexedDB', async () => {
    const databaseName = `stockflow-real-blocked-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const legacyDatabase = new Dexie(databaseName);
    legacyDatabase.version(1).stores({
      products: '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt',
      movements: '++id, productId, type, date, syncStatus',
    });
    await legacyDatabase.open();
    legacyDatabase.close();

    const oldConnectionRequest = indexedDB.open(databaseName);
    const oldConnection = await new Promise<IDBDatabase>((resolve, reject) => {
      oldConnectionRequest.onsuccess = () => resolve(oldConnectionRequest.result);
      oldConnectionRequest.onerror = () => reject(oldConnectionRequest.error);
    });
    oldConnection.onversionchange = () => undefined;

    const upgradingDatabase = new StockFlowDatabase(databaseName);
    const manager = createManager(upgradingDatabase);
    const unsubscribe = manager.subscribe(vi.fn());
    const opening = upgradingDatabase.open();

    await vi.waitFor(() => expect(manager.getState().status).toBe('upgrade-blocked'));
    oldConnection.close();
    await opening;

    expect(manager.getState().status).toBe('normal');
    expect(upgradingDatabase.verno).toBe(11);
    upgradingDatabase.close();
    unsubscribe();
  });
});
