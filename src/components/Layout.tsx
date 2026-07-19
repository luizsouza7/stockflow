import { NavLink, Outlet } from 'react-router-dom';
import { OfflineBanner } from './OfflineBanner';
import { PwaUpdateBanner } from './PwaUpdateBanner';
import { DatabaseLifecycleBanner } from './DatabaseLifecycleBanner';
import { StatusBadge } from './StatusBadge';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePwaUpdate } from '../hooks/usePwaUpdate';
import { useDatabaseLifecycle } from '../hooks/useDatabaseLifecycle';
import { SyncStatusIndicator } from './SyncStatusIndicator';

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'D' },
  { to: '/produtos', label: 'Produtos', icon: 'P' },
  { to: '/categorias', label: 'Categorias', icon: 'C' },
  { to: '/movimentacoes', label: 'Movimentos', icon: 'M' },
  { to: '/alertas', label: 'Alertas', icon: 'A' },
  { to: '/dados', label: 'Dados', icon: 'B' },
  { to: '/conta', label: 'Conta', icon: 'U' },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-brand-700 text-white'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
  }`;
}

export function Layout() {
  const isOnline = useOnlineStatus();
  const { isUpdateAvailable, updateNow } = usePwaUpdate();
  const { state: databaseLifecycleState, reloadNow } = useDatabaseLifecycle();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white px-4 py-6 lg:block">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-700">
              StockFlow
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">
              Controle de estoque
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              TCC — Sistema de controle de estoque
            </p>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass}>
                <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-700">
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700 lg:hidden">
                  StockFlow — TCC
                </p>
                <h2 className="text-lg font-semibold text-slate-950 sm:text-xl">
                  Painel de estoque
                </h2>
              </div>
              <StatusBadge isOnline={isOnline} />
            </div>
            <OfflineBanner isOnline={isOnline} />
            <PwaUpdateBanner isVisible={isUpdateAvailable} onUpdate={updateNow} />
            <DatabaseLifecycleBanner state={databaseLifecycleState} onReload={reloadNow} />
            <SyncStatusIndicator
              isOnline={isOnline}
              databaseLifecycleStatus={databaseLifecycleState.status}
            />
          </header>

          <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-8">
            <Outlet />
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-slate-200 bg-white lg:hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${
                isActive ? 'text-brand-700' : 'text-slate-500'
              }`
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
