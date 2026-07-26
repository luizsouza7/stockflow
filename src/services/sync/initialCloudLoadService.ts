import type { AuthService } from '../authService';
import { authService } from '../authService';
import {
  businessContextService,
  type BusinessContextService,
} from '../businessContextService';
import {
  initialCloudLoadRepository,
  type InitialCloudLoadRepository,
  type InitialCloudLoadSnapshot,
} from '../../repositories/initialCloudLoadRepository';
import {
  initialCloudLoadGateway,
  InitialCloudLoadRejectedError,
  type InitialCloudLoadGateway,
  type InitialCloudLoadRemoteResult,
  type InitialCloudLoadRemoteState,
} from './initialCloudLoadGateway';
import { isUuid } from '../../domain/businessScope';
import { generateUuid } from '../../utils/id';
import type { InitialCloudLoadOperation } from '../../types/InitialCloudLoad';
import {
  buildInitialCloudLoadStateText,
  getSnapshotRelatedOutbox,
} from '../../domain/initialCloudLoadState';

export interface InitialCloudLoadBlocker {
  code: string;
  message: string;
}

interface InitialCategoryPayload {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface InitialProductPayload {
  id: string;
  name: string;
  code: string;
  categoryId: string | null;
  salePriceInCents: number;
  currentQuantity: number;
  minimumStock: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface InitialCloudLoadPayload {
  categories: InitialCategoryPayload[];
  products: InitialProductPayload[];
}

export interface InitialCloudLoadPreview {
  userId: string;
  businessId: string;
  businessName: string;
  categories: number;
  activeCategories: number;
  deletedCategories: number;
  products: number;
  activeProducts: number;
  deletedProducts: number;
  historicalMovements: number;
  totalCurrentQuantity: number;
  blockingOutbox: number;
  blockers: InitialCloudLoadBlocker[];
  warnings: string[];
  remoteState: 'empty' | 'initialized' | 'contains-data' | 'unavailable';
  remote: InitialCloudLoadRemoteState;
  payloadText: string;
  payloadHash: string;
  localSignature: string;
  idempotencyKey: string;
  eligible: boolean;
  remoteCommitConfirmed?: boolean;
  confirmedRemoteResult?: InitialCloudLoadRemoteResult;
  reservationOperationId?: string;
  reservationStateText: string;
  reservableOutbox: number;
  reservableEventIds: string[];
}

interface InitialLoadContext {
  userId?: string;
  businessId?: string;
  businessName?: string;
  isOnline: boolean;
}

export interface InitialCloudLoadPreviewResult {
  status: 'ready' | 'blocked';
  message: string;
  preview?: InitialCloudLoadPreview;
}

export interface ExecuteInitialCloudLoadInput extends InitialLoadContext {
  confirmed: boolean;
  preview?: InitialCloudLoadPreview;
}

export interface InitialCloudLoadExecutionResult {
  status: 'completed' | 'blocked';
  message: string;
  result?: InitialCloudLoadRemoteResult;
  recoveryPreview?: InitialCloudLoadPreview;
}

export interface InitialCloudLoadService {
  preview(input: InitialLoadContext): Promise<InitialCloudLoadPreviewResult>;
  execute(input: ExecuteInitialCloudLoadInput): Promise<InitialCloudLoadExecutionResult>;
}

const EMPTY_REMOTE: InitialCloudLoadRemoteState = {
  categories: 0,
  products: 0,
  movements: 0,
  syncOperations: 0,
  bootstrapCompleted: false,
};

export function createInitialCloudLoadService(
  repository: InitialCloudLoadRepository = initialCloudLoadRepository,
  gateway: InitialCloudLoadGateway = initialCloudLoadGateway,
  contextService: BusinessContextService = businessContextService,
  sessionService: Pick<AuthService, 'isConfigured' | 'getSession'> = authService,
  createIdempotencyKey: () => string = generateUuid,
  now: () => Date = () => new Date(),
): InitialCloudLoadService {
  async function validateContext(input: InitialLoadContext) {
    if (!gateway.isConfigured() || !contextService.isConfigured() || !sessionService.isConfigured()) {
      return 'Supabase nao esta configurado para preparar a carga inicial.';
    }
    if (!input.userId) return 'Entre na sua conta antes de preparar a carga inicial.';
    if (!input.businessId) return 'Selecione um estabelecimento antes de preparar a carga inicial.';
    if (!input.isOnline) return 'Conecte-se a internet para preparar a carga inicial.';
    try {
      const session = await sessionService.getSession();
      if (!session) return 'Sua sessao terminou. Entre novamente antes da carga inicial.';
      if (session.user.id !== input.userId) {
        return 'A sessao atual pertence a outra conta. Nenhum dado foi enviado.';
      }
      if (!(await contextService.validateMembership(input.userId, input.businessId))) {
        return 'O estabelecimento selecionado nao pertence mais a esta conta.';
      }
    } catch {
      return 'Nao foi possivel validar sessao e estabelecimento agora.';
    }
    return undefined;
  }

  async function buildPreview(
    input: Required<Pick<InitialLoadContext, 'userId' | 'businessId'>> &
      InitialLoadContext,
    idempotencyKey: string,
  ): Promise<InitialCloudLoadPreview> {
    const snapshot = await repository.readSnapshot(input.businessId);
    const local = await analyzeLocalSnapshot(snapshot, input.userId, input.businessId);
    let remote = EMPTY_REMOTE;
    let remoteState: InitialCloudLoadPreview['remoteState'] = 'unavailable';
    const blockers = [...local.blockers];

    try {
      remote = await gateway.getRemoteState(input.businessId);
      remoteState = remote.bootstrapCompleted
        ? 'initialized'
        : remote.categories + remote.products + remote.movements + remote.syncOperations > 0
          ? 'contains-data'
          : 'empty';
      if (remoteState !== 'empty') {
        blockers.push({
          code: 'remote-not-empty',
          message: remoteState === 'initialized'
            ? 'O estabelecimento remoto ja possui uma carga inicial registrada.'
            : 'O estabelecimento remoto contem dados ou operacoes de estoque.',
        });
      }
    } catch {
      blockers.push({
        code: 'remote-unavailable',
        message: 'Nao foi possivel comprovar que o estabelecimento remoto esta vazio.',
      });
    }

    return {
      userId: input.userId,
      businessId: input.businessId,
      businessName: input.businessName?.trim() || 'Estabelecimento selecionado',
      ...local.summary,
      blockers,
      warnings: [
        'O saldo atual sera usado como saldo inicial remoto.',
        'Movimentacoes historicas permanecerao somente neste dispositivo.',
        'A carga nao libera pull, cursor ou sincronizacao automatica.',
        'Recomenda-se gerar um backup antes da confirmacao.',
      ],
      remoteState,
      remote,
      payloadText: local.payloadText,
      payloadHash: local.payloadHash,
      localSignature: local.localSignature,
      idempotencyKey,
      reservationStateText: local.reservationStateText,
      reservableOutbox: local.reservableEventIds.length,
      reservableEventIds: local.reservableEventIds,
      eligible: blockers.length === 0 && remoteState === 'empty',
    };
  }

  async function continueReservedOperation(
    preview: InitialCloudLoadPreview,
    reservedOperation?: InitialCloudLoadOperation,
  ): Promise<InitialCloudLoadExecutionResult> {
    const operation =
      reservedOperation ??
      (await repository.findActiveOperation(
        preview.userId,
        preview.businessId,
      ));
    if (
      !operation ||
      operation.id !== preview.reservationOperationId ||
      operation.idempotencyKey !== preview.idempotencyKey ||
      operation.payloadHash !== preview.payloadHash
    ) {
      return {
        status: 'blocked',
        message:
          'A reserva persistida da carga inicial nao corresponde a esta previa.',
      };
    }

    let result = operation.remoteResult;
    if (operation.status === 'reserved') {
      try {
        result = await gateway.initialize({
          businessId: operation.businessId,
          idempotencyKey: operation.idempotencyKey,
          payloadText: operation.payloadText,
          payloadHash: operation.payloadHash,
        });
      } catch (error) {
        if (error instanceof InitialCloudLoadRejectedError) {
          try {
            await repository.releaseReservation(operation.id);
          } catch {
            return recoveryFailure(
              preview,
              'O servidor recusou a carga, mas a reserva local nao pôde ser liberada com seguranca. Tente o reparo novamente.',
            );
          }
          return {
            status: 'blocked',
            message: error.message,
          };
        }
        return recoveryFailure(
          preview,
          'Nao foi possivel confirmar se a carga remota concluiu. Os eventos continuam reservados; tente novamente com a mesma operacao.',
        );
      }

      try {
        await repository.markRemoteConfirmed(operation.id, result);
      } catch {
        return recoveryFailure(
          preview,
          'A carga remota respondeu com sucesso, mas a confirmacao local falhou. Os eventos continuam reservados para reparo idempotente.',
        );
      }
    }

    if (!result) {
      return recoveryFailure(
        preview,
        'A operacao local informa commit remoto, mas nao possui resultado recuperavel.',
      );
    }

    try {
      await repository.finalizeReservedSnapshot({
        operationId: operation.id,
        absorbedAt: toIsoString(now()),
        remoteVersion: 1,
      });
    } catch {
      return recoveryFailure(
        preview,
        'A carga remota foi confirmada, mas a finalizacao local falhou. Os eventos permanecem reservados e o reparo pode ser retomado apos reload.',
      );
    }

    return {
      status: 'completed',
      message: result.wasDuplicate
        ? 'A carga remota ja existia; baseline e eventos reservados foram reparados sem duplicacao.'
        : 'O snapshot inicial foi preparado; eventos anteriores foram absorvidos sem replay de movimentos.',
      result,
    };
  }

  return {
    async preview(input) {
      const contextError = await validateContext(input);
      if (contextError) return { status: 'blocked', message: contextError };
      const activeOperation = await repository.findActiveOperation(
        input.userId!,
        input.businessId!,
      );
      if (activeOperation) {
        return {
          status: 'ready',
          message:
            'Existe uma carga inicial reservada. Continue o reparo com a mesma chave; nenhum evento sera enviado individualmente.',
          preview: previewFromOperation(activeOperation),
        };
      }
      const preview = await buildPreview(
        { ...input, userId: input.userId!, businessId: input.businessId! },
        `inventory-bootstrap:${createIdempotencyKey()}`,
      );
      return {
        status: preview.eligible ? 'ready' : 'blocked',
        message: preview.eligible
          ? 'Previa concluida. Revise o snapshot e confirme conscientemente.'
          : 'A carga inicial esta bloqueada. Nenhum dado foi enviado.',
        preview,
      };
    },

    async execute(input) {
      if (!input.confirmed) {
        return { status: 'blocked', message: 'Marque a confirmacao explicita antes de continuar.' };
      }
      if (!input.preview) {
        return { status: 'blocked', message: 'Gere uma previa atual antes de confirmar.' };
      }
      const contextError = await validateContext(input);
      if (contextError) return { status: 'blocked', message: contextError };
      if (
        input.preview.userId !== input.userId ||
        input.preview.businessId !== input.businessId
      ) {
        return { status: 'blocked', message: 'O contexto mudou. Gere uma nova previa.' };
      }
      if (!input.preview.eligible) {
        return { status: 'blocked', message: 'A previa confirmada nao esta elegivel para execucao.' };
      }

      if (input.preview.reservationOperationId) {
        return continueReservedOperation(input.preview);
      }

      const operationId = input.preview.idempotencyKey;
      const operation: InitialCloudLoadOperation = {
        id: operationId,
        userId: input.preview.userId,
        businessId: input.preview.businessId,
        businessName: input.preview.businessName,
        status: 'reserved',
        idempotencyKey: input.preview.idempotencyKey,
        payloadText: input.preview.payloadText,
        payloadHash: input.preview.payloadHash,
        localSignature: input.preview.localSignature,
        categoryIds: parseInitialPayload(input.preview.payloadText).categories.map(
          ({ id }) => id,
        ),
        productIds: parseInitialPayload(input.preview.payloadText).products.map(
          ({ id }) => id,
        ),
        movementIds: [],
        reservedEventIds: input.preview.reservableEventIds,
        createdAt: toIsoString(now()),
      };
      const snapshot = await repository.readSnapshot(input.preview.businessId);
      operation.movementIds = snapshot.movements.map(({ id }) => id).sort();

      try {
        await repository.reserveSnapshot({
          operation,
          expectedStateText: input.preview.reservationStateText,
        });
      } catch (error) {
        return {
          status: 'blocked',
          message:
            error instanceof Error
              ? error.message
              : 'Nao foi possivel reservar a outbox para a carga inicial.',
        };
      }

      return continueReservedOperation({
        ...input.preview,
        reservationOperationId: operationId,
      }, operation);
    },
  };
}

async function analyzeLocalSnapshot(
  snapshot: InitialCloudLoadSnapshot,
  userId: string,
  businessId: string,
) {
  const categories = [...snapshot.categories].sort((a, b) => a.id.localeCompare(b.id));
  const products = [...snapshot.products].sort((a, b) => a.id.localeCompare(b.id));
  const movements = [...snapshot.movements].sort((a, b) => a.id.localeCompare(b.id));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const relatedKeys = new Set([
    ...categories.map(({ id }) => `category:${id}`),
    ...products.map(({ id }) => `product:${id}`),
    ...movements.map(({ id }) => `movement:${id}`),
  ]);
  const blockers: InitialCloudLoadBlocker[] = [];

  for (const category of categories) {
    if (!isUuid(category.id)) addBlocker(blockers, 'invalid-category-id', `Categoria ${category.name} possui UUID invalido.`);
    if (!category.name.trim() || category.name.trim().length > 120) addBlocker(blockers, 'invalid-category-name', `Categoria ${category.id} possui nome invalido.`);
    validateDates(category, 'categoria', blockers);
    if (!isValidOptionalRemoteVersion(category.remoteVersion)) {
      addBlocker(blockers, 'invalid-category-remote-version', `Categoria ${category.id} possui versao remota invalida.`);
    } else if (category.remoteVersion !== undefined) {
      addBlocker(blockers, 'known-category-remote-version', `Categoria ${category.id} ja possui versao remota conhecida e nao e compativel com bootstrap em remoto vazio.`);
    }
  }

  const activeCodes = new Set<string>();
  for (const product of products) {
    if (!isUuid(product.id)) addBlocker(blockers, 'invalid-product-id', `Produto ${product.name} possui UUID invalido.`);
    if (!product.name.trim() || product.name.trim().length > 200) addBlocker(blockers, 'invalid-product-name', `Produto ${product.id} possui nome invalido.`);
    if (!Number.isSafeInteger(product.currentQuantity) || product.currentQuantity < 0) addBlocker(blockers, 'invalid-quantity', `Produto ${product.name} possui quantidade invalida.`);
    if (!Number.isSafeInteger(product.minimumStock) || product.minimumStock < 0) addBlocker(blockers, 'invalid-minimum-stock', `Produto ${product.name} possui estoque minimo invalido.`);
    if (!Number.isSafeInteger(product.salePriceInCents) || product.salePriceInCents < 0) addBlocker(blockers, 'invalid-price', `Produto ${product.name} possui preco invalido.`);
    validateDates(product, 'produto', blockers);
    if (!isValidOptionalRemoteVersion(product.remoteVersion)) {
      addBlocker(blockers, 'invalid-product-remote-version', `Produto ${product.id} possui versao remota invalida.`);
    } else if (product.remoteVersion !== undefined) {
      addBlocker(blockers, 'known-product-remote-version', `Produto ${product.id} ja possui versao remota conhecida e nao e compativel com bootstrap em remoto vazio.`);
    }

    if (product.categoryId) {
      const category = categoryById.get(product.categoryId);
      if (!category) {
        addBlocker(blockers, 'orphan-category', `Produto ${product.name} referencia uma categoria ausente neste estabelecimento.`);
      } else if (category.deletedAt && !product.deletedAt) {
        addBlocker(blockers, 'incompatible-category', `Produto ativo ${product.name} referencia uma categoria excluida.`);
      }
    }
    const normalizedCode = product.code.trim().toLocaleLowerCase('pt-BR');
    if (!product.deletedAt && normalizedCode) {
      if (activeCodes.has(normalizedCode)) addBlocker(blockers, 'duplicate-active-code', `O codigo ativo ${product.code.trim()} esta duplicado.`);
      activeCodes.add(normalizedCode);
    }
  }

  const relatedOutbox = getSnapshotRelatedOutbox(snapshot, businessId);
  const reservableEventIds: string[] = [];
  const blockingEventIds = new Set<string>();
  for (const entry of relatedOutbox) {
    const isReflectedInSnapshot = relatedKeys.has(
      `${entry.entityType}:${entry.entityId}`,
    );
    if (!entry.userId) {
      blockingEventIds.add(entry.id);
      addBlocker(blockers, 'outbox-user-missing', 'A outbox possui evento relacionado sem usuario.');
    } else if (entry.userId !== userId) {
      blockingEventIds.add(entry.id);
      addBlocker(blockers, 'outbox-other-user', 'A outbox possui evento relacionado a outro usuario.');
    }
    if (!entry.businessId) {
      blockingEventIds.add(entry.id);
      addBlocker(blockers, 'outbox-business-missing', 'A outbox possui evento relacionado sem estabelecimento.');
    } else if (entry.businessId !== businessId) {
      blockingEventIds.add(entry.id);
      addBlocker(blockers, 'outbox-other-business', 'A outbox possui evento relacionado a outro estabelecimento.');
    }
    if (!isReflectedInSnapshot) {
      blockingEventIds.add(entry.id);
      addBlocker(blockers, 'outbox-not-in-snapshot', 'A outbox possui evento que nao esta refletido no snapshot local.');
      continue;
    }
    if (
      (entry.status === 'pending' || entry.status === 'error') &&
      entry.userId === userId &&
      entry.businessId === businessId
    ) {
      reservableEventIds.push(entry.id);
      continue;
    }
    if (entry.status === 'processing' || entry.status === 'conflict') {
      blockingEventIds.add(entry.id);
      addBlocker(blockers, `outbox-${entry.status}`, `A outbox possui evento ${entry.status} que nao pode ser reservado.`);
    } else if (entry.status === 'synced') {
      blockingEventIds.add(entry.id);
      addBlocker(blockers, 'outbox-synced-history', 'A outbox registra push individual anterior, incompatível com remoto vazio.');
    } else if (entry.status === 'reserved') {
      blockingEventIds.add(entry.id);
      addBlocker(blockers, 'outbox-orphan-reservation', 'A outbox possui reserva sem operacao de bootstrap recuperada.');
    } else if (entry.status === 'absorbed') {
      blockingEventIds.add(entry.id);
      addBlocker(blockers, 'outbox-absorbed-history', 'A outbox registra snapshot inicial anterior.');
    }
  }

  const payload: InitialCloudLoadPayload = {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      deletedAt: category.deletedAt ?? null,
    })),
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      code: product.code,
      categoryId: product.categoryId ?? null,
      salePriceInCents: product.salePriceInCents,
      currentQuantity: product.currentQuantity,
      minimumStock: product.minimumStock,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      deletedAt: product.deletedAt ?? null,
    })),
  };
  const payloadText = JSON.stringify(payload);
  const reservationStateText = buildInitialCloudLoadStateText(
    snapshot,
    businessId,
  );

  return {
    blockers,
    payload,
    payloadText,
    payloadHash: await sha256(payloadText),
    localSignature: await sha256(reservationStateText),
    reservationStateText,
    reservableEventIds: reservableEventIds.sort(),
    summary: {
      categories: categories.length,
      activeCategories: categories.filter(({ deletedAt }) => !deletedAt).length,
      deletedCategories: categories.filter(({ deletedAt }) => Boolean(deletedAt)).length,
      products: products.length,
      activeProducts: products.filter(({ deletedAt }) => !deletedAt).length,
      deletedProducts: products.filter(({ deletedAt }) => Boolean(deletedAt)).length,
      historicalMovements: movements.length,
      totalCurrentQuantity: products.reduce((total, product) => total + product.currentQuantity, 0),
      blockingOutbox: blockingEventIds.size,
    },
  };
}

function previewFromOperation(
  operation: InitialCloudLoadOperation,
): InitialCloudLoadPreview {
  const payload = parseInitialPayload(operation.payloadText);
  const remoteConfirmed = operation.status === 'remote-confirmed';
  return {
    userId: operation.userId,
    businessId: operation.businessId,
    businessName: operation.businessName,
    categories: payload.categories.length,
    activeCategories: payload.categories.filter(({ deletedAt }) => !deletedAt).length,
    deletedCategories: payload.categories.filter(({ deletedAt }) => Boolean(deletedAt)).length,
    products: payload.products.length,
    activeProducts: payload.products.filter(({ deletedAt }) => !deletedAt).length,
    deletedProducts: payload.products.filter(({ deletedAt }) => Boolean(deletedAt)).length,
    historicalMovements: operation.movementIds.length,
    totalCurrentQuantity: payload.products.reduce(
      (total, product) => total + product.currentQuantity,
      0,
    ),
    blockingOutbox: 0,
    reservableOutbox: operation.reservedEventIds.length,
    blockers: [],
    warnings: [
      'Esta operacao foi recuperada do IndexedDB com a mesma chave e o mesmo payload.',
      'Eventos reservados nao podem ser enviados pelo push normal.',
      'Movimentos anteriores pertencem apenas ao saldo inicial do snapshot.',
    ],
    remoteState: remoteConfirmed ? 'initialized' : 'unavailable',
    remote: EMPTY_REMOTE,
    payloadText: operation.payloadText,
    payloadHash: operation.payloadHash,
    localSignature: operation.localSignature,
    idempotencyKey: operation.idempotencyKey,
    reservationOperationId: operation.id,
    reservationStateText: '',
    reservableEventIds: operation.reservedEventIds,
    eligible: true,
    remoteCommitConfirmed: remoteConfirmed,
    confirmedRemoteResult: operation.remoteResult,
  };
}

function recoveryFailure(
  preview: InitialCloudLoadPreview,
  message: string,
): InitialCloudLoadExecutionResult {
  return {
    status: 'blocked',
    message,
    recoveryPreview: preview,
  };
}

function parseInitialPayload(payloadText: string): InitialCloudLoadPayload {
  const payload = JSON.parse(payloadText) as unknown;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('categories' in payload) ||
    !Array.isArray(payload.categories) ||
    !('products' in payload) ||
    !Array.isArray(payload.products) ||
    payload.categories.some(
      (category) =>
        typeof category !== 'object' ||
        category === null ||
        !('id' in category) ||
        typeof category.id !== 'string',
    ) ||
    payload.products.some(
      (product) =>
        typeof product !== 'object' ||
        product === null ||
        !('id' in product) ||
        typeof product.id !== 'string',
    )
  ) {
    throw new Error('A previa da carga inicial possui payload invalido.');
  }
  return payload as InitialCloudLoadPayload;
}

function validateDates(
  entity: { id: string; createdAt: string; updatedAt: string; deletedAt?: string },
  label: string,
  blockers: InitialCloudLoadBlocker[],
) {
  const dates = [entity.createdAt, entity.updatedAt, ...(entity.deletedAt ? [entity.deletedAt] : [])];
  if (dates.some((value) => !Number.isFinite(Date.parse(value)))) {
    addBlocker(blockers, `invalid-${label}-timestamp`, `${label} ${entity.id} possui timestamp invalido.`);
  }
}

function isValidOptionalRemoteVersion(value: unknown): boolean {
  return (
    value === undefined ||
    (Number.isSafeInteger(value) && Number(value) > 0)
  );
}

function addBlocker(
  blockers: InitialCloudLoadBlocker[],
  code: string,
  message: string,
) {
  if (!blockers.some((blocker) => blocker.code === code && blocker.message === message)) {
    blockers.push({ code, message });
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toIsoString(date: Date): string {
  if (!Number.isFinite(date.getTime())) {
    throw new Error('O relogio local da carga inicial e invalido.');
  }
  return date.toISOString();
}

export const initialCloudLoadService = createInitialCloudLoadService();
