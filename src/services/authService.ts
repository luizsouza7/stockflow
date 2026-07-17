import type { AuthError, Session } from '@supabase/supabase-js';
import { supabaseConnection } from '../lib/supabase';

interface AuthResult {
  data: { session: Session | null };
  error: AuthError | null;
}

export interface AuthApi {
  getSession(): Promise<AuthResult>;
  signInWithPassword(credentials: { email: string; password: string }): Promise<AuthResult>;
  signUp(credentials: { email: string; password: string }): Promise<AuthResult>;
  signOut(): Promise<{ error: AuthError | null }>;
  onAuthStateChange(listener: (session: Session | null) => void): () => void;
}

export interface AuthService {
  isConfigured(): boolean;
  getConfigurationMessage(): string | undefined;
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  subscribe(listener: (session: Session | null) => void): () => void;
}

export type AuthOperation = 'session' | 'sign-in' | 'sign-up' | 'sign-out';

class AuthServiceError extends Error {}

export function createAuthService(api?: AuthApi, configurationMessage?: string): AuthService {
  function requireApi(): AuthApi {
    if (!api) throw new AuthServiceError(configurationMessage ?? 'Supabase nao configurado.');
    return api;
  }

  return {
    isConfigured: () => api !== undefined,
    getConfigurationMessage: () => (api ? undefined : configurationMessage),

    async getSession() {
      const { data, error } = await requireApi().getSession();
      if (error) throw new AuthServiceError(error.message);
      return data.session;
    },

    async signIn(email, password) {
      const { error } = await requireApi().signInWithPassword({ email, password });
      if (error) throw new AuthServiceError(error.message);
    },

    async signUp(email, password) {
      const { error } = await requireApi().signUp({ email, password });
      if (error) throw new AuthServiceError(error.message);
    },

    async signOut() {
      const { error } = await requireApi().signOut();
      if (error) throw new AuthServiceError(error.message);
    },

    subscribe(listener) {
      return requireApi().onAuthStateChange(listener);
    },
  };
}

export function getAuthErrorMessage(operation: AuthOperation): string {
  switch (operation) {
    case 'session':
      return 'Nao foi possivel verificar sua conta agora.';
    case 'sign-in':
      return 'Nao foi possivel entrar. Verifique e-mail, senha e conexao.';
    case 'sign-up':
      return 'Nao foi possivel criar a conta agora. Verifique os dados e tente novamente.';
    case 'sign-out':
      return 'Nao foi possivel sair da conta agora.';
  }
}

const client = supabaseConnection.client;
const authApi: AuthApi | undefined = client
  ? {
      getSession: () => client.auth.getSession(),
      signInWithPassword: (credentials) => client.auth.signInWithPassword(credentials),
      signUp: (credentials) => client.auth.signUp(credentials),
      signOut: () => client.auth.signOut({ scope: 'local' }),
      onAuthStateChange: (listener) => {
        const { data } = client.auth.onAuthStateChange((_event, session) => listener(session));
        return () => data.subscription.unsubscribe();
      },
    }
  : undefined;

export const authService = createAuthService(
  authApi,
  supabaseConnection.configuration.status === 'configured'
    ? undefined
    : supabaseConnection.configuration.message,
);
