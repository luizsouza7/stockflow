# Validação Supabase — carga inicial remota

Status: **Parte 6H-D validada operacionalmente em Supabase real em 26 de julho de 2026**.

A execução usou o estabelecimento descartável **Validação Carga Inicial 6H-D**. Este registro é
sanitizado e não contém tokens, chaves, hashes, project refs ou UUIDs reais.

## Resultado operacional confirmado

- As migrations `202607250001_part6h_initial_cloud_load.sql` e
  `20260726040320_harden_private_function_privileges.sql` foram aplicadas com sucesso; os
  históricos local e remoto ficaram alinhados.
- `initialize_business_inventory` e `get_business_inventory_initialization_state` foram
  confirmadas como `SECURITY DEFINER`, owner `postgres`, `search_path = ''`, com `EXECUTE`
  somente para `authenticated` e sem acesso para `anon`/`PUBLIC`.
- `private.inventory_bootstrap_operations` foi confirmada com RLS ativa, sem policies e sem
  acesso direto para `authenticated`, `anon` ou `PUBLIC`.
- As funções privadas ficaram restritas conforme o hardening: `add_business_owner_membership`,
  `set_updated_at` e `is_finite_timestamptz_text` somente para `postgres`;
  `is_active_business_member` somente para `postgres` e `authenticated`.

Antes da carga, o remoto possuía zero categorias, produtos, movimentos, `sync_operations` e
operações de bootstrap. O snapshot local continha 1 categoria ativa, 3 produtos (2 ativos e 1
soft-deleted), saldo total 43, 3 movimentos históricos, 8 eventos reserváveis e nenhum evento
bloqueador.

Depois da carga foram confirmados:

- 1 categoria e 3 produtos remotos, todos inicialmente em `version = 1`;
- `deleted_at` preservado no produto excluído e saldo remoto total igual a 43;
- zero movimentos históricos e zero `sync_operations` normais criados pelo bootstrap;
- uma única linha no ledger, com `payload_hash` e `idempotency_key` preenchidos;
- os 8 eventos anteriores reservados e absorvidos, sem replay histórico.

Uma segunda tentativa foi bloqueada porque o remoto já estava inicializado. Em seguida, uma nova
entrada local de 2 unidades foi enviada pelo push manual normal: somente esse movimento foi criado
remotamente, o saldo aumentou em 2, a versão do produto avançou de 1 para 2 e nenhuma segunda
operação de bootstrap foi criada.

## Checklist de regressão complementar

Os itens abaixo permanecem como roteiro para futuras regressões operacionais. Itens não marcados
não invalidam o resultado executado acima e não devem ser apresentados como já exercitados.

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
