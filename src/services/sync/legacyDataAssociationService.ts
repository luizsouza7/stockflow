import type { AuthService } from '../authService';
import { authService } from '../authService';
import {
  businessContextService,
  type BusinessContextService,
} from '../businessContextService';
import {
  LegacyAssociationStateError,
  legacyDataAssociationRepository,
  type AppliedLegacyAssociation,
} from '../../repositories/legacyDataAssociationRepository';
import type {
  LegacyAssociationAnalysis,
  LegacyAssociationBlocker,
} from '../../domain/legacyDataAssociation';

interface LegacyAssociationContextInput {
  userId?: string;
  businessId?: string;
  isOnline: boolean;
}

export interface LegacyAssociationPreview {
  categories: number;
  products: number;
  movements: number;
  relatedOutbox: number;
  fullyUnscopedOutbox: number;
  selectedBusinessOutbox: number;
  blockers: LegacyAssociationBlocker[];
  snapshotToken: string;
}

export interface LegacyAssociationPreviewResult {
  status: 'ready' | 'empty' | 'blocked';
  message: string;
  preview?: LegacyAssociationPreview;
}

export interface ConfirmLegacyAssociationInput extends LegacyAssociationContextInput {
  confirmed: boolean;
  expectedSnapshotToken?: string;
}

export interface LegacyAssociationResult {
  status: 'completed' | 'blocked';
  message: string;
  associated: AppliedLegacyAssociation;
}

export interface LegacyDataAssociationService {
  preview(input: LegacyAssociationContextInput): Promise<LegacyAssociationPreviewResult>;
  associate(input: ConfirmLegacyAssociationInput): Promise<LegacyAssociationResult>;
}

interface LegacyDataAssociationRepository {
  preview(userId: string, businessId: string): Promise<LegacyAssociationAnalysis>;
  associate(input: {
    userId: string;
    businessId: string;
    expectedSnapshotToken: string;
  }): Promise<AppliedLegacyAssociation>;
}

const EMPTY_RESULT: AppliedLegacyAssociation = {
  categories: 0,
  products: 0,
  movements: 0,
  outboxUpdated: 0,
};

export function createLegacyDataAssociationService(
  repository: LegacyDataAssociationRepository = legacyDataAssociationRepository,
  contextService: BusinessContextService = businessContextService,
  sessionService: Pick<AuthService, 'isConfigured' | 'getSession'> = authService,
): LegacyDataAssociationService {
  return {
    async preview(input) {
      const context = await validateContext(input, contextService, sessionService);
      if (typeof context === 'string') {
        return { status: 'blocked', message: context };
      }

      const analysis = await repository.preview(context.userId, context.businessId);
      const preview = toPreview(analysis);
      if (analysis.blockers.length > 0) {
        return {
          status: 'blocked',
          message: 'A associação foi bloqueada por inconsistências nos dados locais.',
          preview,
        };
      }
      if (analysis.categories + analysis.products + analysis.movements === 0) {
        return {
          status: 'empty',
          message: 'Não há dados locais legados para associar.',
          preview,
        };
      }
      return {
        status: 'ready',
        message: 'Prévia concluída. Revise todo o conjunto antes de confirmar.',
        preview,
      };
    },

    async associate(input) {
      if (!input.confirmed) {
        return blockedAssociation('Confirme conscientemente a associação integral antes de continuar.');
      }
      if (!input.expectedSnapshotToken) {
        return blockedAssociation('Gere uma nova prévia antes de confirmar a associação.');
      }

      const context = await validateContext(input, contextService, sessionService);
      if (typeof context === 'string') return blockedAssociation(context);

      try {
        const associated = await repository.associate({
          userId: context.userId,
          businessId: context.businessId,
          expectedSnapshotToken: input.expectedSnapshotToken,
        });
        const total = associated.categories + associated.products + associated.movements;
        return {
          status: 'completed',
          message:
            total > 0
              ? `${total} registros locais foram associados. Nenhum dado foi enviado para a nuvem.`
              : 'Não há dados locais legados para associar.',
          associated,
        };
      } catch (error) {
        if (error instanceof LegacyAssociationStateError) {
          return blockedAssociation(error.message);
        }
        throw error;
      }
    },
  };
}

async function validateContext(
  input: LegacyAssociationContextInput,
  contextService: BusinessContextService,
  sessionService: Pick<AuthService, 'isConfigured' | 'getSession'>,
): Promise<{ userId: string; businessId: string } | string> {
  if (!sessionService.isConfigured() || !contextService.isConfigured()) {
    return 'Supabase não está configurado para validar a associação.';
  }
  if (!input.userId) return 'Entre na sua conta antes de associar dados locais.';
  if (!input.businessId) return 'Selecione e valide um estabelecimento antes da associação.';
  if (!input.isOnline) return 'Conecte-se à internet para validar a associação manual.';

  try {
    const session = await sessionService.getSession();
    if (!session) return 'Sua sessão terminou. Entre novamente antes da associação.';
    if (session.user.id !== input.userId) {
      return 'A sessão atual pertence a outra conta. Nenhum dado foi associado.';
    }
    if (!(await contextService.validateMembership(input.userId, input.businessId))) {
      return 'O estabelecimento selecionado não pertence mais a esta conta.';
    }
  } catch {
    return 'Não foi possível validar sessão e estabelecimento agora. Nenhum dado foi associado.';
  }

  return { userId: input.userId, businessId: input.businessId };
}

function toPreview(analysis: LegacyAssociationAnalysis): LegacyAssociationPreview {
  return {
    categories: analysis.categories,
    products: analysis.products,
    movements: analysis.movements,
    relatedOutbox: analysis.relatedOutbox,
    fullyUnscopedOutbox: analysis.fullyUnscopedOutbox,
    selectedBusinessOutbox: analysis.selectedBusinessOutbox,
    blockers: analysis.blockers,
    snapshotToken: analysis.snapshotToken,
  };
}

function blockedAssociation(message: string): LegacyAssociationResult {
  return { status: 'blocked', message, associated: EMPTY_RESULT };
}

export const legacyDataAssociationService = createLegacyDataAssociationService();
