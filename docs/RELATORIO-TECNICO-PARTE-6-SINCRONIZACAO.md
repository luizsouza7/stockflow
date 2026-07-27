# Relatório técnico — Parte 6: Sincronização

## 1. Objetivo da Parte 6

A Parte 6 trata da sincronização entre a base local offline-first, mantida em IndexedDB por meio do Dexie, e a base remota PostgreSQL disponibilizada pelo Supabase. Sua implementação foi dividida em etapas incrementais para preservar a integridade dos dados e tornar cada avanço verificável antes da introdução da etapa seguinte.

Essa estratégia não cria nem apresenta uma sincronização simulada como se estivesse completa. A aplicação continua funcionando localmente e offline, e as operações de negócio são persistidas primeiro no dispositivo. No estado atual, dados elegíveis somente são enviados à nuvem por ação manual. A 6H-B associa o legado, a 6H-C isola o runtime e a 6H-D prepara um snapshot inicial remoto sem replay; pull, conflitos e sincronização automática ainda não existem.

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

A etapa 6B implementou o ciclo local da outbox com os estados `pending`, `processing`, `synced`, `error` e `conflict`. A 6H-D acrescentou `reserved` e `absorbed`: o primeiro protege eventos durante o bootstrap e o segundo registra absorção pelo snapshot sem fingir confirmação individual. O processamento utiliza claim transacional para evitar que o mesmo evento seja assumido simultaneamente por mais de um executor local.

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

Naquele momento, a auditoria confirmou que `Category`, `Product` e `Movement` ainda não possuíam `businessId`; suas stores, repositories e consultas de UI eram device-scoped. Existiam dados criados desde versões anteriores à nuvem no mesmo banco. Apenas os eventos da outbox podiam ser associados explicitamente a usuário/business, o que não alterava o escopo das entidades.

Assim, na 6G, a opção C foi adotada. `manualPullService` exigia ação do usuário e validava Supabase configurado, sessão atual, usuário, business selecionado, conectividade e membership. Mesmo com todos os pré-requisitos, terminava no bloqueio então denominado `local-runtime-scope-required`: naquele momento o runtime ainda não filtrava integralmente as telas e operações por business e os formulários comuns ainda podiam criar dados unscoped. Nenhuma tabela de domínio remota era consultada, nenhum dado era aplicado e a outbox não era alterada.

Na 6G, não foi criada Dexie v11; o schema ainda era v10 e todas as migrations históricas foram preservadas. Essas limitações locais foram tratadas posteriormente: a 6H-A criou a fundação e os índices v11 por `businessId`, a 6H-B adicionou a associação explícita do legado e a 6H-C tornou o runtime integralmente scope-aware.

Atualmente, o pull continua bloqueado por `pull-foundation-required`. A carga inicial segura foi implementada na 6H-D e a 6I-A permite somente leitura paginada de inspeção. Ainda faltam cursor incremental persistente, aplicação local de dados remotos, reconciliação e tratamento real de conflitos.

### 10.1. Etapa 6H-A — fundação local de escopo por business

A 6H-A adiciona `businessId?: string` a Category, Product e Movement. Ausência significa entidade legada/unscoped. A decisão preserva integralmente os registros existentes e mantém os formulários atuais no modo local: nenhum business selecionado, evento da outbox ou contexto de autenticação é usado para associar entidades.

O Dexie evolui para v11 apenas com índices `businessId` nas três stores de domínio. Não há callback de backfill. Os testes permanentes v1 → v11 e v10 → v11 preservam IDs, relações, preços, quantidades, snapshots, soft delete e outbox, inclusive o caso em que a outbox possui business e a entidade permanece unscoped.

Regras puras e APIs explícitas de repository separam consultas unscoped e por business. Produto e categoria devem compartilhar escopo; movimento herda o escopo do produto. Atualização comum e soft delete preservam o escopo. Novas mutações scoped criam o evento da outbox com o mesmo business na transação já consolidada. O evento aguarda associação manual de `userId`, que representa o usuário responsável pelo vínculo remoto e não integra a entidade.

Essa fundação não torna a UI integralmente scope-aware, não associa entidades legadas, não cria cursor, gateway ou aplicação de pull. A ação 6C continua restrita à outbox: associa eventos totalmente unscoped ou eventos scoped sem usuário do mesmo business, preservando payload, entidade e isolamento de outro estabelecimento.

### 10.2. Etapa 6H-B — associação explícita e integral do legado

A Conta passa a oferecer uma preview somente leitura do conjunto unscoped e uma confirmação explícita. O serviço reconfirma Supabase, sessão, conectividade, business e membership. A execução relê o snapshot e aborta se ele mudou ou contém relação órfã/incompatível, evento `processing` ou evento relacionado pertencente a outro contexto.

Categorias, produtos, movimentos e eventos elegíveis são atualizados em uma única transação Dexie v11. IDs, relações, estoque, valores, snapshots, soft deletes, payloads, chaves de idempotência, status e tentativas são preservados. Entidades e eventos já scoped permanecem intactos.

Não são criados eventos para registros antigos sem outbox. A associação não representa upload integral e movimentos históricos não são reexecutados remotamente. Push continua manual; pull, cursor, conflitos reais e automação continuam inexistentes.

### 10.3. Etapa 6H-C — runtime local orientado por escopo ativo

`ActiveDataScope` formaliza modo local e modo business. A fonte React única combina sessão atual e
seleção validada persistida por usuário, incluindo nome amigável, sem armazenar token ou senha.
Esse contexto previamente conhecido permite leitura e escrita offline sem chamadas Supabase nas
operações normais.

Dashboard, Produtos, edição por ID, Categorias, Movimentações/Histórico e Alertas usam consultas de
repository por escopo. O modo local enxerga somente ausência de `businessId`; o modo business
enxerga somente o UUID selecionado. Filtros e ordenação continuam no domínio após a consulta
isolada. IDs válidos de outro escopo retornam estado indisponível.

Services recebem `LocalMutationContext` explicitamente. Criação, update, delete e movimento
revalidam o escopo nas transações; movimento herda o business do produto. Outboxes business novas
recebem `userId` e `businessId` na mesma transação, enquanto o modo local permanece integralmente
unscoped. Troca de contexto reassina consultas, invalida formulários e descarta feedback assíncrono
antigo.

O indicador do layout usa o nome do estabelecimento, sem UUID como título. Associação do legado e
push permanecem manuais. A troca de business não move dados, não associa, não envia e não baixa.
Backup JSON e CSV continuam device-wide e incluem todos os escopos presentes no dispositivo.
Ao fim da 6H-C, Dexie permanecia v11 e o Service Worker não foi alterado.

### 10.4. Etapa 6H-D — carga inicial remota sem replay histórico

A Conta oferece preview local/remoto e confirmação explícita. O snapshot inclui categorias e
produtos ativos ou soft-deleted do business selecionado, preserva UUIDs, relações, valores e
saldo atual, e exclui movimentos e outbox. Eventos locais incompatíveis bloqueiam a operação.

O remoto precisa estar vazio de categorias, produtos, movimentos, operações de sync e bootstrap
anterior. A RPC usa sessão, membership, RLS, hash, lock transacional e ledger da carga inteira.
Categorias são inseridas antes dos produtos e `current_quantity` é escrito diretamente somente
nesse bootstrap protegido, com `version = 1`. Não existe `upsert`, `DELETE`, sobrescrita ou
alteração de dados locais de domínio. A validação operacional real foi concluída em 26 de julho
de 2026 e está registrada no checklist dedicado.

A auditoria posterior identificou que `version = 1` precisava de representação local explícita.
Category e Product agora possuem `remoteVersion?`, gravado atomicamente como 1 após sucesso ou
`wasDuplicate`. Todo push confirmado de categoria/produto passa a avançar esse metadado, e
`movement.created` grava `productVersion` no produto sem alterar novamente o estoque ou criar
`product.updated`. O push posterior usa o máximo entre a versão da entidade e a maior versão synced
da outbox. Dados de outro business e versões inválidas são recusados.
O metadado integra o backup JSON, mas é omitido do CSV operacional e dos formulários.

A persistência da versão local antecede o status `synced`. Se ela falhar após o commit remoto, o
evento permanece em erro e a repetição idempotente repara o metadado antes de concluir.

A auditoria funcional final demonstrou um impasse: `pending`/`error` bloqueavam a carga, mas o
push normal preenchia o remoto e também impedia o bootstrap. A solução reserva em uma transação
Dexie todos os eventos compatíveis já refletidos no snapshot. Outra aba não pode reivindicá-los,
nem eventos posteriores do mesmo business, enquanto a operação estiver ativa.

Após sucesso/duplicata, baseline e absorção são finalizadas atomicamente. Eventos anteriores viram
`absorbed` com motivo `initial-cloud-load-snapshot`; movimentos históricos não são inseridos
remotamente e representam somente parte do saldo inicial. Eventos criados depois da captura
permanecem `pending` e voltam ao push normal após a conclusão. `synced` permanece reservado a
push individual realmente confirmado.

Para recuperação após reload, o schema evolui para Dexie v12 com a store técnica
`initialCloudLoads`, que persiste chave, payload, hash, IDs reservados e resultado remoto quando
conhecido. Rejeição remota definitiva restaura os status anteriores; resposta perdida ou falha
local mantém a reserva e reutiliza a mesma operação. Fresh v12 e upgrades v11 → v12 e v1 → v12
são testados, sem alterar migrations históricas.

O ledger privado não permite acesso direto por `authenticated`. Por isso, as duas RPCs do ledger
usam `SECURITY DEFINER`, owner e `search_path` controlados, com auth/membership explícitas;
`initialize_business_inventory` valida membership antes do lock, usa `FOR UPDATE` na linha do
business e então revalida/protege a membership com `FOR SHARE` antes da idempotência e da prova
de vazio. A RPC também rejeita timestamps inválidos ou não finitos. As FKs dos escritores normais
coordenam com esse lock e impedem mistura concorrente silenciosa. O payload é limitado a 5 MiB,
5.000 categorias e 20.000 produtos antes dos loops de validação.

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
- contexto ativo, rotas/mutações isoladas, continuidade offline e ausência de automação da 6H-C.

Como fotografias das etapas, a entrega 6C registrou 406 testes aprovados, a 6E registrou 439, a revisão da 6G aprovou 461 em 45 arquivos e a 6H-A aprovou 494 em 48. A 6H-B aprovou 531 testes em 50 arquivos; a 6H-C aprovou 557 em 52, a base 6H-D aprovou 597 em 56, as revisões intermediárias aprovaram 614, 634, 652 e 653 em 58, e a auditoria final do lock persistido aprovou 669 em 58.

Além da suíte automatizada, as etapas 6D, 6F e 6H-D foram validadas operacionalmente em Supabase
real de teste. A 6D verificou a base remota, Auth, business/membership e push de
categorias/produtos; a 6F verificou a RPC de estoque, seus efeitos transacionais e a recusa de
snapshot divergente.

Na 6H-D, as migrations da carga inicial e do hardening foram aplicadas com histórico local/remoto
alinhado. Foram confirmados `SECURITY DEFINER`, owner `postgres`, `search_path` vazio, execução
somente por `authenticated`, ledger privado com RLS sem policies e privilégios restritos das
funções privadas.

O business descartável **Validação Carga Inicial 6H-D** começou sem categorias, produtos,
movimentos, `sync_operations` ou bootstrap. O snapshot de 1 categoria, 3 produtos — incluindo um
soft-deleted —, saldo 43, 3 movimentos históricos e 8 eventos reserváveis resultou em 1 categoria
e 3 produtos remotos em versão 1, saldo 43, nenhum movimento histórico, nenhuma
`sync_operation` normal e uma única operação no ledger. Uma segunda carga foi bloqueada. Um novo
movimento de entrada de 2 unidades foi então enviado normalmente, elevou saldo e versão do
produto para 2 e não criou outro bootstrap. A evidência sanitizada está em
[VALIDACAO-SUPABASE-CARGA-INICIAL.md](./VALIDACAO-SUPABASE-CARGA-INICIAL.md).

## 15. Limitações atuais

- pull remoto funcional continua bloqueado por ausência de cursor, aplicação local remota, reconciliação e estratégia real de conflitos;
- cursor de pull não foi criado porque não há aplicação segura que possa consumi-lo;
- central de conflitos ainda não existe;
- resolução real de conflitos ainda não existe;
- sincronização automática ainda não existe;
- sincronização bidirecional completa ainda não existe;
- múltiplos dispositivos ainda exigem validações práticas adicionais;
- o loading do push e da verificação bloqueada de pull permanece separado.

Por essas limitações, a Parte 6 permanece em andamento.

## 16. Próximos passos recomendados

1. Definir cursor confiável, aplicação local transacional e reconciliação antes de liberar pull.
2. Tratar conflitos básicos após a existência de um pull confiável.
3. Implementar uma central de conflitos, se necessária para os cenários reais do TCC.
4. Realizar a revisão final da Parte 6 contra as regras 43–54 e seus critérios de aceite.

Cada passo deve permanecer separado e receber testes e validação proporcionais ao risco antes do avanço seguinte.

## 17. Conclusão

A Parte 6 avançou de maneira incremental, segura e testada: outbox, retry, push protegido, validações reais, RPC atômica, bloqueio consciente do pull, fundação local de escopo, associação explícita do legado, runtime isolado e carga inicial remota por snapshot.

A Parte 6 ainda não está integralmente concluída. A base de push remoto e a carga inicial segura
estão operacionalmente validadas. A 6I-A acrescenta RPC e UI de leitura paginada somente para
inspeção, com watermark, cursor efêmero, soft deletes e proteção contra stale context; sua
migration ainda não foi aplicada. O watermark inicial considera o maior `sortTime` finito visível,
pois timestamps podem ser preservados do dispositivo; valores não finitos bloqueiam a leitura e
o JSON de cada página é limitado a 5 MiB sem truncagem. Pull funcional, cursor incremental persistente, aplicação local de dados remotos,
conflitos reais, central de conflitos e sincronização automática permanecem evoluções futuras
explícitas.
