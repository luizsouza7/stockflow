# Relatório técnico — Parte 6: Sincronização

## 1. Objetivo da Parte 6

A Parte 6 trata da sincronização entre a base local offline-first, mantida em IndexedDB por meio do Dexie, e a base remota PostgreSQL disponibilizada pelo Supabase. Sua implementação foi dividida em etapas incrementais para preservar a integridade dos dados e tornar cada avanço verificável antes da introdução da etapa seguinte.

Essa estratégia não cria nem apresenta uma sincronização simulada como se estivesse completa. A aplicação continua funcionando localmente e offline, e as operações de negócio são persistidas primeiro no dispositivo. No estado atual, dados elegíveis somente são enviados à nuvem por uma ação manual e controlada. A 6H-B associa o legado localmente sem representar upload; pull, conflitos e sincronização automática ainda não existem.

## 2. Relação com o Prompt Mestre

A Parte 6 corresponde às regras 43–54 do Prompt Mestre. Sem reproduzir seu conteúdo integral, a relação temática é:

- **Regra 43 — sincronização incremental:** evolução por etapas pequenas, verificáveis e compatíveis com o funcionamento local;
- **Regra 44 — outbox local:** persistência dos eventos que representam mutações ainda não confirmadas remotamente;
- **Regra 45 — estados de sincronização:** representação explícita do ciclo de processamento e das falhas;
- **Regra 46 — push:** envio controlado das alterações locais elegíveis;
- **Regra 47 — retry:** novas tentativas com controle de tempo, erro e quantidade de tentativas;
- **Regra 48 — pull:** recebimento seguro de alterações remotas, ainda pendente;
- **Regra 49 — soft delete:** preservação da semântica de exclusão lógica durante a futura convergência;
- **Regra 50 — conflitos:** detecção e tratamento de divergências, ainda sem resolução real implementada;
- **Regra 51 — movimentações e concorrência:** proteção especial para alterações de estoque;
- **Regra 52 — função atômica no PostgreSQL:** execução remota indivisível das movimentações;
- **Regra 53 — central de conflitos:** interface e persistência próprias, ainda pendentes;
- **Regra 54 — experiência da sincronização:** comunicação honesta de estados, limites e ações disponíveis.

O Prompt Mestre permanece a referência normativa do projeto e não foi alterado para a produção deste relatório.

## 3. Visão geral da arquitetura de sincronização

A arquitetura atual pode ser resumida em dois caminhos coordenados:

```text
Operação local:
UI → Services → Repositories → Dexie/IndexedDB

Envio manual:
UI → manualPushService → syncService → syncRemoteGateway → Supabase/RPCs
                              ↓
                       outboxRepository
```

Os principais componentes são:

- **IndexedDB/Dexie:** fonte de dados local e base do funcionamento offline-first;
- **outbox local:** fila persistente de eventos criados junto das mutações de negócio;
- **`outboxRepository`:** acesso persistente, consultas e transições da outbox;
- **`outboxService`:** criação e preparação dos eventos locais;
- **`syncService`:** coordenação do claim, processamento, sucesso, falha e retry;
- **`manualPushService`:** entrada explícita do fluxo de envio iniciado pelo usuário;
- **`syncRemoteGateway`:** fronteira de comunicação com as RPCs do Supabase;
- **`businessContextService`:** validação e seleção do estabelecimento ativo e associação explícita das pendências;
- **Supabase Auth:** identificação da sessão usada no acesso remoto;
- **PostgreSQL/RLS:** persistência remota e isolamento por usuário e estabelecimento;
- **RPCs:** operações remotas protegidas, idempotentes e, para estoque, atômicas;
- **`sync_operations`:** ledger remoto de idempotência e versões aplicadas.

O gateway remoto não substitui os repositories locais. Ele é acionado somente pelo fluxo manual autorizado, enquanto o Dexie permanece responsável pela persistência e experiência local.

## 4. Etapa 6A — Fundação local da outbox

A etapa 6A introduziu a store local `outbox` na versão 10 do schema Dexie. Mutações de categorias, produtos e movimentações passaram a produzir eventos com estado `pending`. A alteração da entidade e a criação do evento ocorrem na mesma transação local, com semântica de tudo-ou-nada.

Cada evento recebe uma `idempotencyKey`, além das informações necessárias para seu processamento posterior. A interface passou a apresentar um estado honesto das pendências locais, sem declarar que os dados já estavam na nuvem.

Nessa etapa não havia acesso de negócio ao Supabase, push, pull ou qualquer envio pela rede. Sua importância acadêmica está em impedir o cenário no qual uma alteração local é confirmada sem que exista o evento correspondente para sincronização. Isso preserva a abordagem offline-first e cria uma base segura para as etapas remotas posteriores.

## 5. Etapa 6B — Processamento local e retry

A etapa 6B implementou o ciclo local da outbox com os estados `pending`, `processing`, `synced`, `error` e `conflict`. O processamento utiliza claim transacional para evitar que o mesmo evento seja assumido simultaneamente por mais de um executor local.

O executor é injetado no serviço, mantendo a lógica de processamento desacoplada do Supabase. Em caso de sucesso, o evento conclui seu ciclo conforme o contrato do processador. Em caso de falha, a outbox preserva o evento, incrementa as tentativas, registra `nextAttemptAt`, armazena `lastError` sanitizado e aplica backoff progressivo. Também foi criado um reset explícito para eventos que permaneceram em `processing` além do limite seguro.

Não foram introduzidos `setInterval`, background sync, gatilho por login, retorno da rede ou push automático. O modelo evita loops agressivos, permite diagnóstico, conserva as pendências durante falhas e prepara o envio remoto sem comprometer o funcionamento local.

## 6. Etapa 6C — Push remoto manual e protegido

A etapa 6C conectou o processador ao Supabase por meio de gateway e RPCs para categorias e produtos. O push depende de ação manual, sessão autenticada, `businessId` selecionado e membership validada para o estabelecimento.

Pendências antigas ou device-scoped precisam ser associadas explicitamente ao contexto ativo. A associação é uma ação separada e não realiza envio. Eventos sem `businessId` continuam bloqueados, evitando atribuição implícita de dados locais a uma conta ou estabelecimento. Naquele momento, `movement.created` também permanecia bloqueado por ainda não existir uma operação remota atômica adequada.

A separação entre contexto, associação e envio reduz o risco de misturar usuários ou estabelecimentos. Também impede que um push parcial seja apresentado como sincronização completa: não havia pull nem sincronização automática.

## 7. Etapa 6D — Validação operacional da base Supabase

A etapa 6D validou a base preparada pelas etapas 5 e 6C em um ambiente Supabase real de teste. O registro detalhado e sanitizado está em [VALIDACAO-SUPABASE-6D.md](./VALIDACAO-SUPABASE-6D.md).

Foram confirmados operacionalmente:

- aplicação das migrations remotas;
- autenticação pelo Supabase Auth;
- business e membership;
- seleção do estabelecimento;
- associação explícita das pendências;
- push manual de categorias e produtos;
- registros de idempotência em `sync_operations`;
- bloqueio de `movement.created`, compatível com o limite da etapa naquele momento.

Essa validação demonstrou que o fluxo funcionava fora dos mocks, sem antecipar a sincronização de estoque nem os recursos de pull e conflitos.

## 8. Etapa 6E — RPC atômica de movimentações

A etapa 6E adicionou uma migration própria e a RPC `public.register_stock_movement`. O gateway passou a aceitar o push manual de `movement.created` somente para movimentações rastreadas e compatíveis.

A RPC valida sessão, membership, business e produto. Durante a operação, executa `SELECT ... FOR UPDATE` sobre o produto, impedindo alterações concorrentes sobre o mesmo saldo enquanto a transação está em andamento. O servidor valida estoque negativo, compara `previousQuantity` e `resultingQuantity` com o estado remoto, insere o movimento, atualiza `products.current_quantity`, incrementa a versão e registra a idempotência em `sync_operations` na mesma transação.

Movimentos legados sem snapshots seguros permanecem bloqueados. O frontend não atualiza diretamente o `current_quantity` remoto: movimentações compatíveis passam exclusivamente pela RPC. A etapa não introduziu pull, resolução real de conflitos ou central de conflitos.

Essa decisão é relevante porque estoque não pode ser sincronizado com simples last-write-wins. Uma sobrescrita do saldo descartaria movimentações concorrentes. A função atômica cria a base necessária para múltiplos dispositivos, embora cenários concorrentes amplos ainda precisem de validação adicional.

## 9. Etapa 6F — Validação operacional da RPC de movimentações

A etapa 6F validou a migration e a RPC da 6E em um ambiente Supabase real de teste. O registro detalhado e sanitizado está em [VALIDACAO-SUPABASE-6F.md](./VALIDACAO-SUPABASE-6F.md).

Foram confirmados:

- envio de saída de estoque;
- envio de entrada de estoque;
- gravação dos registros em `stock_movements`;
- atualização correta de `products.current_quantity`;
- incremento de `products.version`;
- registro de `movement.created` em `sync_operations`;
- recusa de uma movimentação com snapshot divergente, sem sobrescrita silenciosa do saldo remoto.

Foi observada uma ressalva visual: após o envio ser aplicado com sucesso no Supabase, o botão “Enviando...” podia permanecer nesse estado até a página ser recarregada. O comportamento foi classificado como bug de UI, não como falha da RPC, e foi corrigido em etapa posterior.

## 10. Etapa 6G — auditoria e bloqueio planejado do pull

A auditoria confirmou que `Category`, `Product` e `Movement` não possuem `businessId`; suas stores, repositories e consultas de UI são device-scoped. Existem dados criados desde versões anteriores à nuvem no mesmo banco. Apenas os eventos da outbox podem ser associados explicitamente a usuário/business, o que não altera o escopo das entidades.

Assim, a opção C foi adotada. `manualPullService` exige ação do usuário e valida Supabase configurado, sessão atual, usuário, business selecionado, conectividade e membership. Mesmo com todos os pré-requisitos, termina no bloqueio `local-runtime-scope-required`: o runtime principal ainda não filtra integralmente todas as telas e operações por business, formulários comuns ainda podem criar dados unscoped e ainda faltam estratégia segura de carga inicial, cursor, aplicação local remota e tratamento real de conflitos. Nenhuma tabela de domínio remota é consultada, nenhum dado é aplicado e a outbox não é alterada.

Não foi criada Dexie v11 porque não existe pull capaz de consumir um cursor com segurança. O schema permanece v10 e todas as migrations históricas foram preservadas. O próximo requisito arquitetural é separar entidades locais por business e definir o destino explícito dos dados legados device-scoped.

### 10.1. Etapa 6H-A — fundação local de escopo por business

A 6H-A adiciona `businessId?: string` a Category, Product e Movement. Ausência significa entidade legada/unscoped. A decisão preserva integralmente os registros existentes e mantém os formulários atuais no modo local: nenhum business selecionado, evento da outbox ou contexto de autenticação é usado para associar entidades.

O Dexie evolui para v11 apenas com índices `businessId` nas três stores de domínio. Não há callback de backfill. Os testes permanentes v1 → v11 e v10 → v11 preservam IDs, relações, preços, quantidades, snapshots, soft delete e outbox, inclusive o caso em que a outbox possui business e a entidade permanece unscoped.

Regras puras e APIs explícitas de repository separam consultas unscoped e por business. Produto e categoria devem compartilhar escopo; movimento herda o escopo do produto. Atualização comum e soft delete preservam o escopo. Novas mutações scoped criam o evento da outbox com o mesmo business na transação já consolidada. O evento aguarda associação manual de `userId`, que representa o usuário responsável pelo vínculo remoto e não integra a entidade.

Essa fundação não torna a UI integralmente scope-aware, não associa entidades legadas, não cria cursor, gateway ou aplicação de pull. A ação 6C continua restrita à outbox: associa eventos totalmente unscoped ou eventos scoped sem usuário do mesmo business, preservando payload, entidade e isolamento de outro estabelecimento.

### 10.2. Etapa 6H-B — associação explícita e integral do legado

A Conta passa a oferecer uma preview somente leitura do conjunto unscoped e uma confirmação explícita. O serviço reconfirma Supabase, sessão, conectividade, business e membership. A execução relê o snapshot e aborta se ele mudou ou contém relação órfã/incompatível, evento `processing` ou evento relacionado pertencente a outro contexto.

Categorias, produtos, movimentos e eventos elegíveis são atualizados em uma única transação Dexie v11. IDs, relações, estoque, valores, snapshots, soft deletes, payloads, chaves de idempotência, status e tentativas são preservados. Entidades e eventos já scoped permanecem intactos.

Não são criados eventos para registros antigos sem outbox. A associação não representa upload integral e movimentos históricos não são reexecutados remotamente. Push continua manual; pull, cursor, conflitos reais e automação continuam inexistentes.

## 11. Segurança e privacidade

A integração segue os seguintes limites:

- `.env.local` permanece fora do versionamento;
- a anon key pública pode ser utilizada pelo frontend dentro do modelo de segurança do Supabase, mas a credencial `service_role` nunca deve ser exposta na aplicação cliente;
- Supabase Auth e RLS controlam autenticação e acesso às linhas;
- a membership valida o vínculo do usuário com o business;
- eventos sem `businessId` não são enviados;
- mensagens persistidas em `lastError` são sanitizadas;
- tokens e senhas não integram a outbox;
- payloads sensíveis não devem ser registrados em logs.

Este relatório não contém credenciais, tokens, senhas, URLs reais, project refs completos, UUIDs reais completos, chaves de idempotência reais ou hashes reais.

## 12. Tratamento de estoque e concorrência

No StockFlow, alterações ordinárias de estoque são representadas por movimentações. O histórico de movimentos é append-only no fluxo implementado: uma entrada ou saída cria um novo registro em vez de reescrever um movimento anterior.

Localmente, o saldo do produto e o novo movimento são persistidos na mesma transação Dexie. Remotamente, a RPC atômica bloqueia o produto com `SELECT ... FOR UPDATE`, consulta o saldo atual, verifica estoque suficiente e compara os snapshots recebidos com o resultado calculado no servidor.

Se houver divergência, a movimentação não é gravada e o saldo remoto não é sobrescrito silenciosamente. Movimentos legados sem `previousQuantity` e `resultingQuantity` confiáveis não são enviados. Essa estratégia preserva evidência histórica e evita que uma decisão automática destrua informação necessária para o futuro tratamento de conflitos.

## 13. Experiência do usuário

A experiência atual comunica o estado parcial da sincronização por meio de:

- indicador de pendências locais;
- mensagens que distinguem fila local, processamento, erro e conflito previsto;
- push iniciado manualmente;
- associação de pendências separada da ação de envio;
- textos que não prometem sincronização completa;
- bloqueio explícito da busca manual, com a confirmação de que nenhum dado foi baixado.

A ressalva visual observada na 6F foi corrigida em etapa posterior. O loading da verificação de pull é independente do push e impede duplo clique, sem prometer download.

## 14. Testes e validações

A evolução da Parte 6 foi apoiada por testes automatizados de:

- criação transacional e persistência da outbox;
- instalação e migrations do schema Dexie;
- claim, estados, sucesso, falha, retry/backoff e reset de processamento travado;
- contexto de business e associação explícita;
- gateway Supabase e RPCs com mocks;
- movimentações rastreadas, snapshots, idempotência e atualização atômica esperada;
- ausência de `service_role` no frontend, de gateway/cursor/aplicação de pull e de gatilhos automáticos de sincronização;
- pré-requisitos e bloqueio por scoping local, preservação da outbox e feedback manual da 6G.
- invariantes de escopo, isolamento de repositories, outbox scoped e migrations v1/v10 → v11 da 6H-A.

Como fotografias das etapas, a entrega 6C registrou 406 testes aprovados, a 6E registrou 439, a revisão da 6G aprovou 461 em 45 arquivos e a 6H-A aprovou 494 em 48. A 6H-B aprovou 531 testes em 50 arquivos.

Além da suíte automatizada, as etapas 6D e 6F foram validadas operacionalmente em Supabase real de teste. A 6D verificou a base remota, Auth, business/membership e push de categorias/produtos; a 6F verificou a RPC de estoque, seus efeitos transacionais e a recusa de snapshot divergente.

## 15. Limitações atuais

- pull remoto funcional está bloqueado até existir associação explícita e runtime local integralmente scope-aware;
- cursor de pull não foi criado porque não há aplicação segura que possa consumi-lo;
- central de conflitos ainda não existe;
- resolução real de conflitos ainda não existe;
- sincronização automática ainda não existe;
- sincronização bidirecional completa ainda não existe;
- múltiplos dispositivos ainda exigem validações práticas adicionais;
- o loading do push e da verificação bloqueada de pull permanece separado.

Por essas limitações, a Parte 6 permanece em andamento.

## 16. Próximos passos recomendados

1. Definir e implementar um fluxo consciente de associação dos dados legados, sem inferência pela outbox ou pelo business selecionado.
2. Tornar consultas e mutações do runtime integralmente scope-aware, preservando o modo legado explícito.
3. Retomar o pull com cursor composto e aplicação conservadora somente após essas etapas.
4. Tratar conflitos básicos após a existência de um pull confiável.
5. Implementar uma central de conflitos, se necessária para os cenários reais do TCC.
6. Realizar a revisão final da Parte 6 contra as regras 43–54 e seus critérios de aceite.

Cada passo deve permanecer separado e receber testes e validação proporcionais ao risco antes do avanço seguinte.

## 17. Conclusão

A Parte 6 avançou de maneira incremental, segura e testada: outbox, retry, push protegido, validações reais, RPC atômica, bloqueio consciente do pull, fundação local de escopo e, na 6H-B, associação explícita do legado sem reconstrução remota artificial.

A Parte 6 ainda não está integralmente concluída. Entretanto, a base de push remoto está madura e operacionalmente validada para categorias, produtos e movimentações rastreadas compatíveis. Runtime integralmente scope-aware, estratégia segura de carga inicial, pull funcional, cursor, conflitos reais, central de conflitos e sincronização automática permanecem como evoluções futuras explícitas.
