# ADR-009 — Carga inicial remota por snapshot de estado, sem replay histórico

## Status

Aceita em 25 de julho de 2026.

## Problema

Um estabelecimento que começou offline pode possuir categorias, produtos, saldo e histórico
antes de ter estado remoto correspondente. Reexecutar movimentos antigos poderia duplicar
efeitos, depender de snapshots legados incompletos e produzir saldo diferente do estado atual.
Também não é aceitável usar `upsert`, sobrescrever ou apagar dados remotos.

## Decisão

A carga inicial é manual e explicitamente confirmada na Conta. Ela inclui todas as categorias e
produtos do business ativo, inclusive soft-deleted, preservando UUIDs, relações, preços, códigos,
timestamps compatíveis, estoque mínimo e `currentQuantity`.

O saldo atual é inserido diretamente como saldo inicial por RPC dedicada. Categorias e produtos
começam em `version = 1`. Nenhum `stock_movement` é criado ou enviado.

Uma preview local somente leitura monta payload determinístico, conta movimentos não enviados e
separa outbox compatível de inconsistências bloqueadoras. A preview remota protegida por
sessão, membership e RLS conta categorias, produtos, movimentos, operações de sync e bootstrap
anterior. O business precisa estar comprovadamente vazio.

A auditoria encontrou um impasse: toda mutação do runtime cria outbox, mas bloquear toda
`pending`/`error` tornava o bootstrap impossível; enviar esses eventos primeiro preenchia o remoto
e também tornava o bootstrap impossível. A decisão é reservar atomicamente os eventos
pré-snapshot e absorvê-los depois do commit, sem envio individual.

Na execução, o cliente relê o snapshot e recusa mudanças de dados, usuário ou business. A RPC
`initialize_business_inventory`:

- usa `SECURITY DEFINER`, owner explícito e `search_path = ''`;
- valida `auth.uid()` e membership ativa antes do lock;
- bloqueia a linha de `public.businesses` com `FOR UPDATE`;
- revalida a membership ativa e protege sua linha com `FOR SHARE` até o fim da transação;
- repete atomicamente a prova de vazio;
- valida SHA-256 do texto JSON estável;
- rejeita timestamps inválidos, `infinity` e `-infinity`;
- limita o texto a 5 MiB, 5.000 categorias e 20.000 produtos antes dos loops pesados;
- insere categorias antes de produtos;
- não usa SQL dinâmico, `upsert`, `UPDATE` ou `DELETE` de domínio;
- registra o resultado em `inventory_bootstrap_operations`.

`SECURITY DEFINER` é restrito às duas RPCs que acessam o ledger para que o cliente autenticado
não receba nenhum privilégio direto na tabela privada. As funções não usam SQL dinâmico, aceitam
somente valores como parâmetros, qualificam os objetos acessados, validam o chamador e a
membership e têm execução revogada de `public`/`anon`. Somente a RPC de escrita adquire o lock.

O lock de linha também coordena escritores que não conhecem um advisory lock: as FKs de
`categories`, `products`, `stock_movements` e `sync_operations` precisam proteger a mesma linha
pai. Assim, uma inserção concorrente termina antes do bootstrap e é detectada pela prova de vazio,
ou aguarda a conclusão do snapshot e então obedece ao estado já criado.

A carga possui `idempotencyKey` e `payloadHash` próprios. Mesma chave e payload retornam o
resultado anterior; chave igual com payload diferente falha; nova chave após bootstrap falha.
Perder a resposta depois do commit não duplica registros.

Antes da RPC, uma transação Dexie relê as entidades, movimentos e outbox, compara o estado exato
da preview, cria uma operação persistente e muda somente eventos compatíveis `pending`/`error`
para `reserved`. Enquanto houver reserva, o processador normal não reivindica nenhum evento do
business. Eventos criados depois da captura permanecem `pending` e só voltam a ser processáveis
depois da finalização.

## Consequências

O remoto começa por um estado explícito, sem inventar histórico. Novas mutações continuam criando
outbox e novos movimentos compatíveis continuam usando `register_stock_movement`. O histórico
anterior permanece somente local.

Após sucesso ou resposta idempotente, o cliente grava `remoteVersion = 1` nas categorias e
produtos efetivamente enviados, em uma transação Dexie atômica. Esse baseline técnico permite que
updates/deletes posteriores usem concorrência otimista mesmo antes do primeiro push normal.
Após qualquer push confirmado de categoria/produto, a versão retornada atualiza a entidade; após
`movement.created`, `productVersion` atualiza o produto sem reaplicar estoque nem criar
`product.updated`. Updates/deletes usam a maior versão segura entre a entidade e a outbox synced.
O campo não é editável, não integra o payload remoto e sua ausência significa versão desconhecida.

A versão da entidade é persistida antes de o evento virar `synced`. Se essa gravação local falhar,
o evento permanece em erro; o retry idempotente reaplica a versão retornada e só então conclui.

`remoteVersion` continua sendo metadado opcional não indexado; isoladamente ele não exigiria nova
versão Dexie. A mudança para v12 decorre exclusivamente da operação persistente de reserva e
recuperação descrita abaixo.

A finalização grava a baseline monotônica e muda os eventos reservados para `absorbed` com o
motivo `initial-cloud-load-snapshot`, preservando payload, operação, chave, tentativas e
timestamps. `synced` continua significando confirmação remota individual; um movimento histórico
absorvido representa somente que seu efeito já integra o saldo inicial, não que existe uma linha
`stock_movements` remota.

Falha remota definitiva restaura atomicamente os status anteriores. Resposta perdida ou falha
local posterior mantém a operação e os eventos reservados. Uma nova página encontra essa operação,
reutiliza exatamente `idempotencyKey`, payload e hash e conclui por resposta duplicada ou pelo
resultado remoto já persistido.

Dexie evolui para v12 com a store técnica `initialCloudLoads`. A nova store é necessária para
guardar a operação mesmo quando não houver evento que possa servir como âncora e para recuperar
payload/chave após reload. A v12 não modifica v1–v11, inicia vazia nos upgrades e não integra o
backup de domínio. `remoteVersion = 1` nunca reduz uma versão local maior; qualquer
`remoteVersion` já conhecida na preview bloqueia bootstrap por contradizer remoto vazio.

## Limitações

Não existe sobrescrita, reset remoto ou carga parcial. Os limites escolhidos são proporcionais a
pequenos comércios, mas a migration ainda precisa de validação operacional em business
descartável.

Pull, cursor, aplicação local remota, reconciliação, conflitos reais, central de conflitos e
sincronização automática continuam ausentes.
