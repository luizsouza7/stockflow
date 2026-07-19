import { useCallback, useEffect, useState } from 'react';
import { localDb } from '../services/db/localDb';
import {
  DatabaseLifecycleManager,
  type DatabaseLifecycleState,
} from '../services/db/databaseLifecycle';
import { DatabaseLifecyclePageRuntime } from '../services/db/databaseLifecyclePageRuntime';

const databaseLifecycleManager = new DatabaseLifecycleManager({
  database: localDb,
  reload: () => window.location.reload(),
});

const databaseLifecyclePageRuntime = new DatabaseLifecyclePageRuntime({
  database: localDb,
  manager: databaseLifecycleManager,
  page: window,
});

export function startDatabaseLifecycleMonitoring(): void {
  databaseLifecyclePageRuntime.start();
}

export function useDatabaseLifecycle() {
  const [state, setState] = useState<DatabaseLifecycleState>(() =>
    databaseLifecycleManager.getState(),
  );

  useEffect(() => databaseLifecycleManager.subscribe(setState), []);

  const reloadNow = useCallback(() => databaseLifecycleManager.requestReload(), []);

  return { state, reloadNow };
}
