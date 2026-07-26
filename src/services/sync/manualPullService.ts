import { authService, type AuthService } from '../authService';
import {
  businessContextService,
  type BusinessContextService,
} from '../businessContextService';

export type ManualPullBlockReason =
  | 'supabase-unconfigured'
  | 'session-required'
  | 'business-required'
  | 'offline'
  | 'session-ended'
  | 'session-mismatch'
  | 'membership-invalid'
  | 'pull-foundation-required';

interface ManualPullInput {
  userId?: string;
  businessId?: string;
  isOnline: boolean;
}

export interface ManualPullResult {
  status: 'blocked';
  reason: ManualPullBlockReason;
  message: string;
  downloaded: 0;
  applied: 0;
  ignored: 0;
}

export interface ManualPullService {
  check(input: ManualPullInput): Promise<ManualPullResult>;
}

export function createManualPullService(
  contextService: BusinessContextService = businessContextService,
  sessionService: Pick<AuthService, 'getSession'> = authService,
): ManualPullService {
  return {
    async check({ userId, businessId, isOnline }) {
      if (!contextService.isConfigured()) {
        return blocked(
          'supabase-unconfigured',
          'Supabase nao esta configurado para buscar alteracoes remotas.',
        );
      }
      if (!userId) {
        return blocked('session-required', 'Entre na sua conta antes de verificar a busca remota.');
      }
      if (!businessId) {
        return blocked(
          'business-required',
          'Selecione e valide um estabelecimento antes de verificar a busca remota.',
        );
      }
      if (!isOnline) {
        return blocked('offline', 'Conecte-se a internet para verificar a busca remota manual.');
      }

      let session;
      try {
        session = await sessionService.getSession();
      } catch {
        return blocked(
          'session-ended',
          'Nao foi possivel validar sua sessao agora. Nenhum dado remoto foi baixado.',
        );
      }

      if (!session) {
        return blocked(
          'session-ended',
          'Sua sessao terminou. Entre novamente antes de verificar a busca remota.',
        );
      }
      if (session.user.id !== userId) {
        return blocked(
          'session-mismatch',
          'A sessao atual pertence a outra conta. Nenhum dado remoto foi baixado.',
        );
      }

      if (!(await contextService.validateMembership(userId, businessId))) {
        return blocked(
          'membership-invalid',
          'O estabelecimento selecionado nao pertence mais a esta conta. Nenhum dado remoto foi baixado.',
        );
      }

      return blocked(
        'pull-foundation-required',
        'Busca remota bloqueada com seguranca: a carga inicial foi implementada e ainda precisa de validacao operacional real; faltam cursor, leitura remota, aplicacao local transacional, reconciliacao e tratamento real de conflitos. Nenhum dado remoto foi baixado.',
      );
    },
  };
}

function blocked(reason: ManualPullBlockReason, message: string): ManualPullResult {
  return { status: 'blocked', reason, message, downloaded: 0, applied: 0, ignored: 0 };
}

export const manualPullService = createManualPullService();
