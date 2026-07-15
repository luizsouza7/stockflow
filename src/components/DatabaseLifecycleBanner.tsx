import type { DatabaseLifecycleState } from '../services/db/databaseLifecycle';

interface DatabaseLifecycleBannerProps {
  state: DatabaseLifecycleState;
  onReload: () => void;
}

export function DatabaseLifecycleBanner({ state, onReload }: DatabaseLifecycleBannerProps) {
  if (state.status === 'normal') {
    return null;
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <span className="font-medium">{state.message}</span>
      {state.status === 'reload-required' ? (
        <button
          type="button"
          onClick={onReload}
          className="shrink-0 rounded-md bg-amber-800 px-3 py-1.5 font-semibold text-white transition hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          Recarregar agora
        </button>
      ) : null}
    </div>
  );
}
