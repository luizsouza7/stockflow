export const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const;

export interface PwaUpdateController {
  requestUpdate: () => boolean;
  dispose: () => void;
}

interface ObservePwaUpdatesOptions {
  serviceWorker: ServiceWorkerContainer;
  onUpdateAvailable: () => void;
  reload: () => void;
}

export async function observePwaUpdates({
  serviceWorker,
  onUpdateAvailable,
  reload,
}: ObservePwaUpdatesOptions): Promise<PwaUpdateController> {
  const registration = await serviceWorker.register('/sw.js', { type: 'module' });
  let waitingWorker: ServiceWorker | null = null;
  let installingWorker: ServiceWorker | null = null;
  let updateRequested = false;
  let hasReloaded = false;
  let isDisposed = false;

  const exposeWaitingWorker = (worker: ServiceWorker | null) => {
    if (!worker || !serviceWorker.controller || isDisposed || waitingWorker === worker) {
      return;
    }

    waitingWorker = worker;
    onUpdateAvailable();
  };

  const handleInstallingStateChange = () => {
    if (installingWorker?.state === 'installed') {
      exposeWaitingWorker(registration.waiting ?? installingWorker);
    }
  };

  const trackInstallingWorker = () => {
    const nextInstallingWorker = registration.installing;
    if (installingWorker === nextInstallingWorker) {
      handleInstallingStateChange();
      return;
    }

    installingWorker?.removeEventListener('statechange', handleInstallingStateChange);
    installingWorker = nextInstallingWorker;
    installingWorker?.addEventListener('statechange', handleInstallingStateChange);
    handleInstallingStateChange();
  };

  const handleControllerChange = () => {
    if (updateRequested && !hasReloaded && !isDisposed) {
      hasReloaded = true;
      reload();
    }
  };

  registration.addEventListener('updatefound', trackInstallingWorker);
  serviceWorker.addEventListener('controllerchange', handleControllerChange);
  exposeWaitingWorker(registration.waiting);
  trackInstallingWorker();

  return {
    requestUpdate() {
      if (!waitingWorker || isDisposed) {
        return false;
      }

      updateRequested = true;
      waitingWorker.postMessage(SKIP_WAITING_MESSAGE);
      return true;
    },
    dispose() {
      isDisposed = true;
      registration.removeEventListener('updatefound', trackInstallingWorker);
      installingWorker?.removeEventListener('statechange', handleInstallingStateChange);
      serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    },
  };
}
