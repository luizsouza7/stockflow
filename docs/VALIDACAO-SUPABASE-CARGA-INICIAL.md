# Validação Supabase — carga inicial remota

Status: **checklist preparado e ainda não executado contra o projeto Supabase real**.

Executar posteriormente apenas com usuário de teste e business descartável/vazio. Não registrar
tokens, chaves ou UUIDs reais.

## Preparação

- [ ] Gerar backup local.
- [ ] Aplicar todas as migrations, inclusive `202607250001_part6h_initial_cloud_load.sql`.
- [ ] Confirmar sessão e membership ativa.
- [ ] Confirmar que `authenticated` não possui `SELECT`, `INSERT`, `UPDATE` ou `DELETE` direto no
      ledger privado; somente as RPCs controladas podem acessá-lo.
- [ ] Confirmar ausência de categorias, produtos, movimentos, operações de sync e bootstrap.
- [ ] Confirmar preview remota vazia e elegível.
- [ ] Confirmar schema Dexie v12 e store `initialCloudLoads` vazia antes do primeiro bootstrap.

## Carga válida

- [ ] Usar categorias/produtos ativos e soft-deleted.
- [ ] Confirmar explicitamente **Preparar estado atual na nuvem**.
- [ ] Conferir UUIDs, relações, código, preço, `current_quantity` e `minimum_stock`.
- [ ] Conferir `version = 1`, timestamps e `deleted_at`.
- [ ] Conferir `remoteVersion = 1` local em todas as categorias e produtos incluídos.
- [ ] Editar/excluir categoria e produto após a carga; confirmar push com `expectedVersion = 1`.
- [ ] Confirmar ausência de novos `stock_movements`.
- [ ] Confirmar eventos anteriores como `absorbed`, com motivo
      `initial-cloud-load-snapshot`, sem alteração de payload/chave/tentativas/timestamps.
- [ ] Confirmar que `synced` continua restrito a confirmação remota individual.
- [ ] Confirmar movimentos e estoque locais inalterados.

## Idempotência e bloqueios

- [ ] Repetir mesma chave/payload; confirmar `was_duplicate = true`.
- [ ] Repetir mesma chave com payload divergente; confirmar rejeição.
- [ ] Usar chave nova após bootstrap; confirmar rejeição.
- [ ] Confirmar bloqueio quando houver categoria, produto, movimento ou operação remota.
- [ ] Confirmar isolamento de outro business.
- [ ] Confirmar recusa sem sessão ou membership.
- [ ] Confirmar recusa acima de 5 MiB, 5.000 categorias ou 20.000 produtos, sem escrita parcial.
- [ ] Revogar/desativar a membership durante uma execução concorrente; confirmar que a segunda
      leitura, sob `FOR SHARE`, impede bootstrap sem membership ativa.
- [ ] Enviar `createdAt`, `updatedAt` e `deletedAt` inválidos, `infinity` e `-infinity` em
      categorias/produtos; confirmar rejeição e rollback integral.

## Atomicidade e rollback

- [ ] Enviar produto inválido depois de categorias válidas.
- [ ] Confirmar rollback total, sem linha parcial ou ledger residual.
- [ ] Testar relação órfã e código ativo duplicado.
- [ ] Executar duas chamadas concorrentes; confirmar uma única carga.
- [ ] Concorrer bootstrap com push/inserção de categoria, produto e movimento; confirmar que o
      lock da linha pai impede mistura silenciosa.
- [ ] Confirmar ausência de `DELETE`, sobrescrita e atualização de domínio existente.
- [ ] Simular falha local após commit remoto; recarregar a página e confirmar recuperação pela
      operação persistida, mesma chave/payload e resposta duplicada.
- [ ] Simular rejeição remota definitiva e confirmar restauração integral de `pending`/`error`.
- [ ] Simular resposta perdida e confirmar que os eventos continuam `reserved`, nunca liberados
      para push normal antes do reparo.
- [ ] Criar evento depois da reserva; confirmar que permanece `pending` e se torna enviável
      somente após a finalização.
- [ ] Confirmar que movimento pré-snapshot vira `absorbed` e não é enviado; movimento posterior
      continua usando `register_stock_movement`.
- [ ] Após pushes de categoria/produto, confirmar avanço de `remoteVersion`; após movimento,
      confirmar avanço pelo `productVersion` sem nova alteração de estoque nem `product.updated`.
- [ ] Confirmar que edição do produto após movimento usa a maior versão conhecida entre entidade
      e outbox synced.

## Encerramento

- [ ] Registrar data, ambiente e resultado sanitizado.
- [ ] Manter pull bloqueado.
- [ ] Não criar cursor nem habilitar sincronização automática.
