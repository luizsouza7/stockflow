import { authService, type AuthService } from '../authService';
import {
  businessContextService,
  type BusinessContextService,
} from '../businessContextService';
import type { RemoteInventoryCursor, RemoteInventoryPage } from '../../types/RemoteInventory';
import {
  remoteInventoryReadGateway,
  RemoteInventoryReadError,
  type RemoteInventoryReadGateway,
} from './remoteInventoryReadGateway';

export interface RemoteInventoryReadInput {
  userId: string;
  businessId: string;
  pageSize?: number;
}

export interface RemoteInventoryReadService {
  readFirstRemoteInventoryPage(input: RemoteInventoryReadInput): Promise<RemoteInventoryPage>;
  readNextRemoteInventoryPage(
    input: RemoteInventoryReadInput & { cursor: RemoteInventoryCursor },
  ): Promise<RemoteInventoryPage>;
}

export function createRemoteInventoryReadService(
  gateway: RemoteInventoryReadGateway = remoteInventoryReadGateway,
  contextService: BusinessContextService = businessContextService,
  sessionService: Pick<AuthService, 'getSession'> = authService,
): RemoteInventoryReadService {
  async function read(
    input: RemoteInventoryReadInput,
    cursor?: RemoteInventoryCursor,
  ): Promise<RemoteInventoryPage> {
    if (!input.userId || !input.businessId) {
      throw new RemoteInventoryReadError(
        'business',
        'Selecione um estabelecimento antes da leitura remota.',
      );
    }
    if (!gateway.isConfigured() || !contextService.isConfigured()) {
      throw new RemoteInventoryReadError(
        'unconfigured',
        'Supabase nao esta configurado para a inspecao remota.',
      );
    }

    let session;
    try {
      session = await sessionService.getSession();
    } catch {
      throw new RemoteInventoryReadError(
        'network',
        'Nao foi possivel validar a sessao para a leitura remota.',
      );
    }
    if (!session || session.user.id !== input.userId) {
      throw new RemoteInventoryReadError(
        'authentication',
        'A sessao mudou. Reinicie a leitura remota.',
      );
    }
    if (contextService.getSelected(input.userId) !== input.businessId) {
      throw new RemoteInventoryReadError(
        'business',
        'O estabelecimento ativo mudou. Reinicie a leitura remota.',
      );
    }
    let hasMembership: boolean;
    try {
      hasMembership = await contextService.validateMembership(input.userId, input.businessId);
    } catch {
      throw new RemoteInventoryReadError(
        'network',
        'Nao foi possivel validar o acesso ao estabelecimento agora.',
      );
    }
    if (!hasMembership) {
      throw new RemoteInventoryReadError(
        'membership',
        'Sua conta nao possui acesso ativo a este estabelecimento.',
      );
    }

    const expectedUserId = input.userId;
    const expectedBusinessId = input.businessId;
    const page = await gateway.readPage(expectedBusinessId, cursor, input.pageSize);
    let currentSession;
    try {
      currentSession = await sessionService.getSession();
    } catch {
      throw new RemoteInventoryReadError(
        'network',
        'Nao foi possivel reconfirmar a sessao apos a leitura remota.',
      );
    }
    if (
      !currentSession ||
      currentSession.user.id !== expectedUserId ||
      contextService.getSelected(expectedUserId) !== expectedBusinessId
    ) {
      throw new RemoteInventoryReadError(
        'business',
        'A conta ou o estabelecimento mudou durante a leitura. O resultado foi descartado.',
      );
    }
    return page;
  }

  return {
    readFirstRemoteInventoryPage(input) {
      return read(input);
    },
    readNextRemoteInventoryPage(input) {
      if (!input.cursor) {
        throw new RemoteInventoryReadError(
          'invalid-cursor',
          'Carregue a primeira pagina antes de avancar.',
        );
      }
      if (input.cursor.businessId !== input.businessId) {
        throw new RemoteInventoryReadError(
          'invalid-cursor',
          'O cursor pertence a outro estabelecimento.',
        );
      }
      if (input.cursor.version !== 1) {
        throw new RemoteInventoryReadError(
          'invalid-cursor',
          'A versao do cursor de paginacao nao e suportada.',
        );
      }
      return read(input, input.cursor);
    },
  };
}

export const remoteInventoryReadService = createRemoteInventoryReadService();
