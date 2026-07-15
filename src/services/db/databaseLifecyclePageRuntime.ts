import type Dexie from 'dexie';
import type { DatabaseLifecycleManager } from './databaseLifecycle';

interface PageLifecycleTarget {
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
}

interface DatabaseLifecyclePageRuntimeOptions {
  database: Dexie;
  manager: DatabaseLifecycleManager;
  page: PageLifecycleTarget;
}

export class DatabaseLifecyclePageRuntime {
  private readonly database: Dexie;
  private readonly manager: DatabaseLifecycleManager;
  private readonly page: PageLifecycleTarget;
  private isMonitoring = false;
  private restoreGeneration = 0;
  private restorePromise: Promise<void> = Promise.resolve();

  constructor({ database, manager, page }: DatabaseLifecyclePageRuntimeOptions) {
    this.database = database;
    this.manager = manager;
    this.page = page;
  }

  start(): void {
    if (this.isMonitoring || this.manager.getState().status === 'reload-required') {
      return;
    }

    this.isMonitoring = true;
    this.manager.start();
    this.page.addEventListener('pagehide', this.handlePageHide, { once: true });
  }

  dispose(): void {
    this.invalidateRestore();
    this.page.removeEventListener('pagehide', this.handlePageHide);
    this.page.removeEventListener('pageshow', this.handlePageShow);
    this.manager.stop();
    this.isMonitoring = false;
  }

  whenRestored(): Promise<void> {
    return this.restorePromise;
  }

  private readonly handlePageHide: EventListener = (event) => {
    if (!this.isMonitoring) {
      return;
    }

    this.invalidateRestore();
    this.isMonitoring = false;
    this.page.removeEventListener('pagehide', this.handlePageHide);
    this.manager.stop();
    this.database.close();

    if ((event as PageTransitionEvent).persisted === true) {
      this.page.addEventListener('pageshow', this.handlePageShow, { once: true });
    }
  };

  private readonly handlePageShow: EventListener = () => {
    this.page.removeEventListener('pageshow', this.handlePageShow);

    if (this.manager.getState().status === 'reload-required') {
      return;
    }

    this.start();
    const restoreGeneration = ++this.restoreGeneration;
    const previousRestore = this.restorePromise;

    this.restorePromise = previousRestore.then(async () => {
      if (!this.isCurrentRestore(restoreGeneration)) {
        return;
      }

      try {
        await this.database.open();
      } catch {
        if (this.isCurrentRestore(restoreGeneration)) {
          this.manager.requireReload();
        }
        return;
      }

      if (!this.isCurrentRestore(restoreGeneration)) {
        this.database.close();
      }
    });
  };

  private invalidateRestore(): void {
    this.restoreGeneration += 1;
  }

  private isCurrentRestore(restoreGeneration: number): boolean {
    return (
      restoreGeneration === this.restoreGeneration &&
      this.isMonitoring &&
      this.manager.getState().status !== 'reload-required'
    );
  }
}
