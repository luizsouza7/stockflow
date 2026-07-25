/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  getDataScopeLabel,
  getDataScopeToken,
  type ActiveDataScope,
} from '../domain/businessScope';
import {
  businessContextService,
  type BusinessContextService,
} from '../services/businessContextService';
import { useAuthSession } from './useAuthSession';

export interface ActiveDataScopeState {
  scope: ActiveDataScope;
  scopeToken: string;
  label: string;
  isLoading: boolean;
  error?: string;
}

const LOCAL_SCOPE: ActiveDataScope = { kind: 'local' };
const LOCAL_STATE: ActiveDataScopeState = {
  scope: LOCAL_SCOPE,
  scopeToken: getDataScopeToken(LOCAL_SCOPE),
  label: getDataScopeLabel(LOCAL_SCOPE),
  isLoading: false,
};

const ActiveDataScopeContext = createContext<ActiveDataScopeState>(LOCAL_STATE);

interface ActiveDataScopeProviderProps {
  children: ReactNode;
  contextService?: BusinessContextService;
}

export function ActiveDataScopeProvider({
  children,
  contextService = businessContextService,
}: ActiveDataScopeProviderProps) {
  const authState = useAuthSession();
  const [, setSelectionRevision] = useState(0);

  useEffect(
    () =>
      contextService.subscribe?.(() => {
        setSelectionRevision((revision) => revision + 1);
      }),
    [contextService],
  );

  const value: ActiveDataScopeState = (() => {
    if (authState.status === 'loading') {
      return { ...LOCAL_STATE, isLoading: true };
    }

    if (authState.status !== 'authenticated') {
      return {
        ...LOCAL_STATE,
        ...(authState.status === 'error' ? { error: authState.message } : {}),
      };
    }

    const userId = authState.session.user.id;
    const selected = contextService.getSelectedContext?.(userId);
    const selectedId = selected?.id ?? contextService.getSelected(userId);
    if (!selectedId) return LOCAL_STATE;

    const scope: ActiveDataScope = {
      kind: 'business',
      userId,
      businessId: selectedId,
      businessName: selected?.name ?? 'Estabelecimento selecionado',
    };

    return {
      scope,
      scopeToken: getDataScopeToken(scope),
      label: getDataScopeLabel(scope),
      isLoading: false,
    };
  })();

  return (
    <ActiveDataScopeContext.Provider value={value}>
      {children}
    </ActiveDataScopeContext.Provider>
  );
}

export function useActiveDataScope(): ActiveDataScopeState {
  return useContext(ActiveDataScopeContext);
}
