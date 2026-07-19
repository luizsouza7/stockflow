import type Dexie from 'dexie';

export const DATABASE_LIFECYCLE_CHANNEL_NAME = 'stockflow-database-lifecycle';

export const DATABASE_UPGRADE_BLOCKED_MESSAGE = Object.freeze({
  type: 'DATABASE_UPGRADE_BLOCKED',
} as const);

export type DatabaseLifecycleState =
  | { status: 'normal' }
  | {
      status: 'reload-required';
      message: string;
    }
  | {
      status: 'upgrade-blocked';
      message: string;
    };

interface BroadcastChannelLike {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
  postMessage(message: unknown): void;
  close(): void;
}

interface DatabaseLifecycleManagerOptions {
  database: Dexie;
  reload: () => void;
  createBroadcastChannel?: (name: string) => BroadcastChannelLike | undefined;
}

type StateListener = (state: DatabaseLifecycleState) => void;

const NORMAL_STATE: DatabaseLifecycleState = { status: 'normal' };

const RELOAD_REQUIRED_STATE: DatabaseLifecycleState = {
  status: 'reload-required',
  message:
    'A conexão com o armazenamento local precisa ser reiniciada com segurança. Recarregue esta aba para continuar.',
};

const UPGRADE_BLOCKED_STATE: DatabaseLifecycleState = {
  status: 'upgrade-blocked',
  message:
    'Uma atualização do armazenamento está aguardando o fechamento de outra aba do StockFlow. Feche ou recarregue as outras abas e tente novamente.',
};

function createBrowserBroadcastChannel(name: string): BroadcastChannelLike | undefined {
  if (typeof BroadcastChannel === 'undefined') {
    return undefined;
  }

  return new BroadcastChannel(name);
}

function isUpgradeBlockedMessage(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    Object.keys(value).length === 1 &&
    (value as { type?: unknown }).type === DATABASE_UPGRADE_BLOCKED_MESSAGE.type
  );
}

export class DatabaseLifecycleManager {
  private readonly database: Dexie;
  private readonly reload: () => void;
  private readonly createBroadcastChannel: (
    name: string,
  ) => BroadcastChannelLike | undefined;
  private readonly listeners = new Set<StateListener>();
  private state: DatabaseLifecycleState = NORMAL_STATE;
  private channel?: BroadcastChannelLike;
  private isStarted = false;
  private reloadRequested = false;

  constructor({
    database,
    reload,
    createBroadcastChannel = createBrowserBroadcastChannel,
  }: DatabaseLifecycleManagerOptions) {
    this.database = database;
    this.reload = reload;
    this.createBroadcastChannel = createBroadcastChannel;
  }

  getState(): DatabaseLifecycleState {
    return this.state;
  }

  start(): void {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    this.database.on('versionchange', this.handleVersionChange);
    this.database.on('blocked', this.handleBlocked);
    this.database.on('ready', this.handleReady, true);

    try {
      this.channel = this.createBroadcastChannel(DATABASE_LIFECYCLE_CHANNEL_NAME);
      this.channel?.addEventListener('message', this.handleChannelMessage);
    } catch {
      this.channel = undefined;
    }
  }

  stop(): void {
    if (!this.isStarted) {
      return;
    }

    this.database.on.versionchange.unsubscribe(this.handleVersionChange);
    this.database.on.blocked.unsubscribe(this.handleBlocked);
    this.database.on.ready.unsubscribe(this.handleReady);
    this.channel?.removeEventListener('message', this.handleChannelMessage);
    this.channel?.close();
    this.channel = undefined;
    this.isStarted = false;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  requireReload(): void {
    if (this.state.status === 'reload-required') {
      return;
    }

    this.database.close();
    this.setState(RELOAD_REQUIRED_STATE);
    this.stop();
  }

  requestReload(): boolean {
    if (this.state.status !== 'reload-required' || this.reloadRequested) {
      return false;
    }

    this.reloadRequested = true;
    this.reload();
    return true;
  }

  private readonly handleVersionChange = () => {
    this.requireReload();
  };

  private readonly handleBlocked = () => {
    if (
      this.state.status === 'reload-required' ||
      this.state.status === 'upgrade-blocked'
    ) {
      return;
    }

    this.setState(UPGRADE_BLOCKED_STATE);
    this.channel?.postMessage(DATABASE_UPGRADE_BLOCKED_MESSAGE);
  };

  private readonly handleReady = () => {
    if (this.state.status === 'upgrade-blocked') {
      this.setState(NORMAL_STATE);
    }
  };

  private readonly handleChannelMessage: EventListener = (event) => {
    if (
      !(event instanceof MessageEvent) ||
      !isUpgradeBlockedMessage(event.data) ||
      this.state.status === 'reload-required'
    ) {
      return;
    }

    this.requireReload();
  };

  private setState(nextState: DatabaseLifecycleState): void {
    if (this.state.status === nextState.status) {
      return;
    }

    this.state = nextState;
    this.listeners.forEach((listener) => listener(this.state));
  }
}
