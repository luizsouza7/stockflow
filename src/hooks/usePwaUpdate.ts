import { useCallback, useEffect, useRef, useState } from 'react';
import {
  observePwaUpdates,
  type PwaUpdateController,
} from '../pwa/pwaUpdateManager';

export function usePwaUpdate() {
  const controllerRef = useRef<PwaUpdateController | null>(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
      return;
    }

    let isDisposed = false;

    observePwaUpdates({
      serviceWorker: navigator.serviceWorker,
      onUpdateAvailable: () => {
        if (!isDisposed) {
          setIsUpdateAvailable(true);
        }
      },
      reload: () => window.location.reload(),
    })
      .then((controller) => {
        if (isDisposed) {
          controller.dispose();
          return;
        }
        controllerRef.current = controller;
      })
      .catch(() => undefined);

    return () => {
      isDisposed = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  const updateNow = useCallback(() => controllerRef.current?.requestUpdate() ?? false, []);

  return { isUpdateAvailable, updateNow };
}
