import { type FormEvent, useRef, useState } from 'react';
import { useAuthSession } from '../hooks/useAuthSession';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  authService,
  getAuthErrorMessage,
  type AuthOperation,
  type AuthService,
} from '../services/authService';
import {
  businessContextService,
  type BusinessContextService,
} from '../services/businessContextService';
import { ManualCloudPushPanel } from '../components/ManualCloudPushPanel';

type AuthMode = 'sign-in' | 'sign-up';

interface AccountProps {
  service?: AuthService;
  contextService?: BusinessContextService;
}

export function Account({
  service = authService,
  contextService = businessContextService,
}: AccountProps) {
  const sessionState = useAuthSession(service);
  const isOnline = useOnlineStatus();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isCloudActionBusy, setIsCloudActionBusy] = useState(false);
  const submissionInProgress = useRef(false);

  async function runOperation(operation: AuthOperation, action: () => Promise<void>) {
    if (submissionInProgress.current) return;
    submissionInProgress.current = true;
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await action();
      if (operation === 'sign-up') {
        setSuccess('Conta criada. Verifique seu e-mail se a confirmacao estiver habilitada.');
      }
    } catch {
      setError(getAuthErrorMessage(operation));
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOnline) {
      setError('Conecte-se a internet para entrar ou criar uma conta.');
      return;
    }

    const normalizedEmail = email.trim();
    const operation = mode === 'sign-in' ? 'sign-in' : 'sign-up';
    void runOperation(operation, () =>
      mode === 'sign-in'
        ? service.signIn(normalizedEmail, password)
        : service.signUp(normalizedEmail, password),
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-slate-950">Conta</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          A conta prepara o StockFlow para recursos de nuvem futuros. Seus dados locais ainda nao
          sao enviados ou sincronizados automaticamente.
        </p>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
        O controle local de estoque, as movimentacoes e o backup continuam disponiveis sem login.
      </aside>

      {!isOnline && (
        <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Voce esta offline. Uma sessao ja conhecida pode continuar visivel, mas novos acessos
          exigem conexao.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {success}
        </p>
      )}

      {sessionState.status === 'loading' && (
        <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Verificando sua conta...
        </p>
      )}

      {sessionState.status === 'unconfigured' && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="font-semibold text-amber-950">Conta indisponivel neste ambiente</h2>
          <p role="status" className="mt-2 text-sm text-amber-800">
            {sessionState.message}
          </p>
        </section>
      )}

      {sessionState.status === 'error' && (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {sessionState.message}
        </p>
      )}

      {sessionState.status === 'authenticated' && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-950">Conta conectada</h2>
          <p className="mt-2 text-sm text-slate-600">
            Conectado como <strong>{sessionState.session.user.email ?? 'usuario autenticado'}</strong>.
          </p>
          <button
            type="button"
            onClick={() =>
              void runOperation('sign-out', async () => {
                await service.signOut();
                contextService.clearSelected(sessionState.session.user.id);
              })
            }
            disabled={isSubmitting || isCloudActionBusy}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Saindo...' : 'Sair da conta'}
          </button>
        </section>
      )}

      {sessionState.status === 'authenticated' && (
        <ManualCloudPushPanel
          session={sessionState.session}
          isOnline={isOnline}
          contextService={contextService}
          onBusyChange={setIsCloudActionBusy}
        />
      )}

      {sessionState.status === 'unauthenticated' && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid grid-cols-2 rounded-md border border-slate-300 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode('sign-in')}
              disabled={isSubmitting}
              aria-pressed={mode === 'sign-in'}
              className={`min-h-10 rounded px-3 text-sm font-semibold ${mode === 'sign-in' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'}`}
            >
              Ja tenho conta
            </button>
            <button
              type="button"
              onClick={() => setMode('sign-up')}
              disabled={isSubmitting}
              aria-pressed={mode === 'sign-up'}
              className={`min-h-10 rounded px-3 text-sm font-semibold ${mode === 'sign-up' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'}`}
            >
              Quero criar conta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label htmlFor="account-email" className="block text-sm font-medium text-slate-700">
              E-mail
              <input
                id="account-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                required
                className="input mt-2"
              />
            </label>
            <label htmlFor="account-password" className="block text-sm font-medium text-slate-700">
              Senha
              <input
                id="account-password"
                type="password"
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                minLength={6}
                required
                className="input mt-2"
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting || !isOnline}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? mode === 'sign-in'
                  ? 'Entrando...'
                  : 'Criando conta...'
                : mode === 'sign-in'
                  ? 'Entrar'
                  : 'Criar conta'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
