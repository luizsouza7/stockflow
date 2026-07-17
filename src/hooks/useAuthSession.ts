import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  authService,
  getAuthErrorMessage,
  type AuthService,
} from '../services/authService';

export type AuthSessionState =
  | { status: 'loading' }
  | { status: 'unconfigured'; message: string }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; session: Session }
  | { status: 'error'; message: string };

export function useAuthSession(service: AuthService = authService): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>(() =>
    service.isConfigured()
      ? { status: 'loading' }
      : {
          status: 'unconfigured',
          message:
            service.getConfigurationMessage() ??
            'Supabase ainda nao esta configurado neste ambiente.',
        },
  );

  useEffect(() => {
    if (!service.isConfigured()) return;

    let isActive = true;
    let sessionRevision = 0;
    const unsubscribe = service.subscribe((session) => {
      if (!isActive) return;
      sessionRevision += 1;
      setState(toSessionState(session));
    });
    const revisionBeforeLoad = sessionRevision;

    void service
      .getSession()
      .then((session) => {
        if (isActive && sessionRevision === revisionBeforeLoad) {
          setState(toSessionState(session));
        }
      })
      .catch(() => {
        if (isActive && sessionRevision === revisionBeforeLoad) {
          setState({ status: 'error', message: getAuthErrorMessage('session') });
        }
      });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [service]);

  return state;
}

function toSessionState(session: Session | null): AuthSessionState {
  return session ? { status: 'authenticated', session } : { status: 'unauthenticated' };
}
