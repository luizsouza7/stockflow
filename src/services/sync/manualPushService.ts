import { outboxRepository } from '../../repositories/outboxRepository';
import { authService, type AuthService } from '../authService';
import {
  businessContextService,
  type BusinessContextService,
} from '../businessContextService';
import { processOutboxBatch, type OutboxExecutor } from './syncService';
import {
  syncRemoteGateway,
  type SyncRemoteGateway,
} from './syncRemoteGateway';
import { categoryRepository } from '../../repositories/categoryRepository';
import { productRepository } from '../../repositories/productRepository';
import { getValidatedRemoteVersion } from '../../domain/remoteVersion';

interface ControlledPushInput {
  userId?: string;
  businessId?: string;
  isOnline: boolean;
  batchSize?: number;
}

interface BindLocalEventsInput {
  userId?: string;
  businessId?: string;
  isOnline: boolean;
  now?: () => Date;
}

export interface ManualPushResult {
  status: 'blocked' | 'completed';
  message: string;
  claimed: number;
  succeeded: number;
  failed: number;
}

export interface BindLocalEventsResult {
  status: 'blocked' | 'completed';
  message: string;
  bound: number;
}

export interface LocalPushSummary {
  unscoped: number;
  awaitingUserBinding: number;
  selectedBusiness: number;
}

export interface ManualPushService {
  getLocalSummary(userId?: string, businessId?: string): Promise<LocalPushSummary>;
  bindLocalEvents(input: BindLocalEventsInput): Promise<BindLocalEventsResult>;
  push(input: ControlledPushInput): Promise<ManualPushResult>;
}

export function createManualPushService(
  gateway: SyncRemoteGateway = syncRemoteGateway,
  contextService: BusinessContextService = businessContextService,
  sessionService: Pick<AuthService, 'getSession'> = authService,
): ManualPushService {
  return {
    async getLocalSummary(userId, businessId) {
      const [unscoped, awaitingUserBinding, selectedBusiness] = await Promise.all([
        outboxRepository.countUnscoped(),
        businessId
          ? outboxRepository.countEligibleForBinding(businessId)
          : Promise.resolve(0),
        userId && businessId
          ? outboxRepository.countForContext(userId, businessId)
          : Promise.resolve(0),
      ]);
      return { unscoped, awaitingUserBinding, selectedBusiness };
    },

    async bindLocalEvents({ userId, businessId, isOnline, now = () => new Date() }) {
      const blocked = validatePrerequisites({
        gateway,
        contextService,
        userId,
        businessId,
        isOnline,
      });
      if (blocked) return { status: 'blocked', message: blocked, bound: 0 };

      const sessionError = await validateCurrentSession(sessionService, userId!);
      if (sessionError) return { status: 'blocked', message: sessionError, bound: 0 };

      if (!(await contextService.validateMembership(userId!, businessId!))) {
        return {
          status: 'blocked',
          message: 'O estabelecimento selecionado nao pertence mais a esta conta.',
          bound: 0,
        };
      }

      const bound = await outboxRepository.bindEligibleForContext({
        userId: userId!,
        businessId: businessId!,
        boundAt: toIsoString(now()),
      });
      return {
        status: 'completed',
        message:
          bound > 0
            ? `${bound} ${bound === 1 ? 'alteracao local foi associada' : 'alteracoes locais foram associadas'} ao estabelecimento. Nenhum dado foi enviado.`
            : 'Nao ha alteracoes locais elegiveis para associar a este contexto.',
        bound,
      };
    },

    async push({ userId, businessId, isOnline, batchSize }) {
      const blocked = validatePrerequisites({
        gateway,
        contextService,
        userId,
        businessId,
        isOnline,
      });
      if (blocked) return blockedPush(blocked);

      const sessionError = await validateCurrentSession(sessionService, userId!);
      if (sessionError) return blockedPush(sessionError);

      if (!(await contextService.validateMembership(userId!, businessId!))) {
        return blockedPush('O estabelecimento selecionado nao pertence mais a esta conta.');
      }

      if (
        await outboxRepository.hasBootstrapReservationForBusiness(businessId!)
      ) {
        return blockedPush(
          'A carga inicial deste estabelecimento esta reservada. Conclua ou repare essa operacao antes do push manual.',
        );
      }

      const executor = createRemoteExecutor(gateway, userId!, businessId!);
      const result = await processOutboxBatch({
        executor,
        batchSize,
        canProcess: (entry) =>
          entry.userId === userId && entry.businessId === businessId,
      });

      return {
        status: 'completed',
        message: toPushMessage(result.succeeded, result.failed),
        ...result,
      };
    },
  };
}

function createRemoteExecutor(
  gateway: SyncRemoteGateway,
  userId: string,
  businessId: string,
): OutboxExecutor {
  return async (entry) => {
    if (entry.userId !== userId || entry.businessId !== businessId) {
      throw new Error('A alteracao local pertence a outro contexto e nao pode ser enviada.');
    }

    const isCreation = entry.operation.endsWith('.created');
    const expectedVersion = isCreation
      ? undefined
      : await resolveExpectedVersion(entry, userId, businessId);

    if (!isCreation && expectedVersion === undefined) {
      throw new Error('A alteracao local nao possui uma versao remota segura para atualizacao.');
    }

    const result = await gateway.push(entry, expectedVersion);
    await persistConfirmedRemoteVersion(entry, businessId, result);
    return {
      archiveAsSynced: true,
      remoteVersion: result.remoteVersion,
    };
  };
}

async function resolveExpectedVersion(
  entry: Parameters<OutboxExecutor>[0],
  userId: string,
  businessId: string,
): Promise<number | undefined> {
  const syncedVersion = await outboxRepository.findLatestSyncedVersion(
    entry.entityType,
    entry.entityId,
    userId,
    businessId,
  );
  let entityRemoteVersion: number | undefined;
  if (entry.entityType === 'category') {
    entityRemoteVersion = await categoryRepository.findRemoteVersionForBusiness(
      entry.entityId,
      businessId,
    );
  } else if (entry.entityType === 'product') {
    entityRemoteVersion = await productRepository.findRemoteVersionForBusiness(
      entry.entityId,
      businessId,
    );
  }

  if (syncedVersion === undefined) return entityRemoteVersion;
  if (entityRemoteVersion === undefined) return syncedVersion;
  return Math.max(syncedVersion, entityRemoteVersion);
}

async function persistConfirmedRemoteVersion(
  entry: Parameters<OutboxExecutor>[0],
  businessId: string,
  result: Awaited<ReturnType<SyncRemoteGateway['push']>>,
): Promise<void> {
  if (entry.entityType === 'category') {
    await categoryRepository.updateRemoteVersionForBusiness(
      entry.entityId,
      businessId,
      getRequiredRemoteVersion(result.remoteVersion),
    );
    return;
  }

  if (entry.entityType === 'product') {
    await productRepository.updateRemoteVersionForBusiness(
      entry.entityId,
      businessId,
      getRequiredRemoteVersion(result.remoteVersion),
    );
    return;
  }

  const productId =
    'productId' in entry.payload ? entry.payload.productId : undefined;
  if (typeof productId !== 'string') {
    throw new Error('A movimentacao confirmada nao identifica um produto valido.');
  }
  await productRepository.updateRemoteVersionForBusiness(
    productId,
    businessId,
    getRequiredRemoteVersion(result.productVersion),
  );
}

function getRequiredRemoteVersion(value: unknown): number {
  const remoteVersion = getValidatedRemoteVersion(value);
  if (remoteVersion === undefined) {
    throw new Error('O servidor nao retornou uma versao remota valida.');
  }
  return remoteVersion;
}

function validatePrerequisites({
  gateway,
  contextService,
  userId,
  businessId,
  isOnline,
}: {
  gateway: SyncRemoteGateway;
  contextService: BusinessContextService;
  userId?: string;
  businessId?: string;
  isOnline: boolean;
}): string | undefined {
  if (!gateway.isConfigured() || !contextService.isConfigured()) {
    return 'Supabase nao esta configurado para o envio de alteracoes.';
  }
  if (!userId) return 'Entre na sua conta antes de enviar alteracoes.';
  if (!businessId) return 'Selecione e valide um estabelecimento antes do envio.';
  if (!isOnline) return 'Conecte-se a internet para tentar o envio manual.';
  return undefined;
}

function blockedPush(message: string): ManualPushResult {
  return { status: 'blocked', message, claimed: 0, succeeded: 0, failed: 0 };
}

async function validateCurrentSession(
  sessionService: Pick<AuthService, 'getSession'>,
  expectedUserId: string,
): Promise<string | undefined> {
  try {
    const session = await sessionService.getSession();
    if (!session) return 'Sua sessao terminou. Entre novamente antes do envio.';
    if (session.user.id !== expectedUserId) {
      return 'A sessao atual pertence a outra conta. Nenhuma alteracao foi enviada.';
    }
    return undefined;
  } catch {
    return 'Nao foi possivel validar sua sessao agora. Nenhuma alteracao foi enviada.';
  }
}

function toPushMessage(succeeded: number, failed: number): string {
  if (succeeded === 0 && failed === 0) {
    return 'Nenhuma alteracao compativel e vinculada estava pronta para envio.';
  }
  if (failed === 0) {
    return `${succeeded} ${succeeded === 1 ? 'alteracao compativel foi enviada' : 'alteracoes compativeis foram enviadas'}. Categorias, produtos e movimentacoes rastreadas sao aceitos; pull ainda nao existe.`;
  }
  return `${succeeded} enviada(s) e ${failed} mantida(s) com erro local e backoff. Movimentacoes legadas ou divergentes exigem atencao; pull ainda nao existe.`;
}

function toIsoString(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error('Relogio local invalido.');
  return date.toISOString();
}

export const manualPushService = createManualPushService();
