# Arquitetura Atual do StockFlow

> Estado funcional consolidado em 17/07/2026 na branch `develop`. Este documento descreve o que existe agora e separa explicitamente o planejamento futuro. O Git é a fonte oficial para hashes e histórico de commits.

## Visão geral atual

O StockFlow é uma aplicação React + TypeScript local-first/offline-first. O navegador executa a interface e mantém a fonte de dados operacional em IndexedDB por meio do Dexie.

```text
UI / Pages
    ↓
Services
    ↓
Repositories
    ↓
Dexie / IndexedDB

Domain → regras puras usadas por Services e UI quando necessário
```

O desenho é deliberadamente simples: não há controllers, interfaces genéricas de repository, container de injeção de dependência nem camadas remotas artificiais. A decisão está registrada em `docs/arquitetura/adrs/ADR-003-separacao-dominio-servicos-repositories.md`.

## Responsabilidades implementadas

### Pages e UI

`src/pages` contém as telas e coordena interação, estados de formulário e navegação:

- `Dashboard.tsx`: indicadores e movimentações recentes;
- `Products.tsx`: busca, filtros, ordenação, listagem, feedback e exclusão lógica;
- `ProductForm.tsx`: cadastro com saldo inicial e edição sem alteração direta de estoque;
- `Categories.tsx`: cadastro, edição, listagem e exclusão lógica;
- `Movements.tsx`: entrada, saída e histórico;
- `Alerts.tsx`: produtos que precisam de reposição.

`src/components` reúne layout, navegação, indicador online/offline e estados reutilizáveis de loading, erro e vazio. A UI não deve conhecer stores ou índices do IndexedDB. As páginas chamam services; não importam `localDb` diretamente.

### Hooks

- `useDexieQuery`: encapsula `liveQuery`, assinatura/limpeza, `data`, `isLoading`, `error` e `refetch`.
- `useOnlineStatus`: inicializa por `navigator.onLine`, observa eventos `online`/`offline` e remove os listeners no cleanup. O valor representa conectividade percebida pelo navegador, não disponibilidade comprovada da internet ou de backend.
- `usePwaUpdate`: registra o service worker somente em produção e expõe uma atualização pronta para a UI sem aplicá-la automaticamente.

O primeiro mantém as telas reativas às alterações locais. O segundo é apenas sinal de conectividade do navegador; não prova que um backend está acessível.

### Domain

`src/domain` contém regras sem React e sem acesso ao banco:

- sanitização, normalização e validação do nome de categoria;
- cálculo de snapshots de entrada/saída e validação de quantidade;
- distinção entre movimentação rastreável e legada;
- classificação `normal`, `low-stock` e `out-of-stock`;
- sanitização e normalização lógica do código interno do produto;
- composição pura dos filtros e ordenações de produtos e movimentações.

Essas funções são testáveis isoladamente e evitam duplicar decisões importantes nas telas.

### Services

Os services representam os casos de uso e coordenam repositories:

- `productService`: listagem enriquecida com categoria, saldo inicial, unicidade de código, edição sem estoque e soft delete;
- `categoryService`: regras de nome, unicidade lógica e exclusão condicionada a produtos ativos;
- `stockMovementService`: transação atômica de estoque e montagem do histórico;
- `dashboardService`: cálculo dos indicadores reais;
- `outboxService`: cria eventos e resume estados; `syncService` mantém claim/retry genérico; `manualPushService` valida sessão/business e compõe o executor; `syncRemoteGateway` mapeia categorias, produtos e movimentos rastreados e chama apenas as RPCs permitidas.

O `stockMovementService` usa `localDb.transaction('rw', ...)` porque precisa garantir atomicidade entre atualização do produto e criação da movimentação.

A Parte 3 foi concluída sem alterar essa arquitetura: o `productService` aplica validações defensivas, o `useDexieQuery` reage a dependências explícitas e a UI distingue estoque baixo de estoque zerado.

### Repositories

`src/repositories` concentra operações diretas nas tabelas Dexie:

- leitura ativa ou completa;
- busca por ID;
- criação, atualização de dados e atualização explícita de estoque;
- consultas por `syncStatus`;
- contagem de produtos ativos por categoria;
- histórico de movimentações ordenado por data.

Os repositories atuais são módulos concretos. Existe apenas a persistência local; criar uma abstração genérica para um backend inexistente seria prematuro.

### Dexie e IndexedDB

`src/services/db/localDb.ts` é responsável por:

- classe `StockFlowDatabase`;
- instância `localDb`;
- schemas das tabelas;
- índices;
- versões e funções de upgrade;
- stores temporárias usadas somente na migration de UUID.

O schema atual é a versão 10 e contém `products`, `movements`, `categories` e `outbox`. A v10 adiciona somente a outbox, sem alterar as stores de domínio. A biblioteca Dexie instalada é 4.4.4.

`src/services/db/databaseLifecycle.ts` observa a instância central antes do primeiro render. Em `versionchange`, a conexão antiga é fechada e a UI exige uma decisão explícita de reload. Em `blocked`, a aba que tenta o upgrade mostra orientação clara e envia somente `{ type: 'DATABASE_UPGRADE_BLOCKED' }` pelo canal `stockflow-database-lifecycle`; abas que reconhecem essa mensagem fecham suas conexões. Mensagens desconhecidas são ignoradas e o canal é opcional. As subscriptions da UI recebem estado, mas não controlam a instalação dos listeners Dexie.

`src/services/db/databaseLifecyclePageRuntime.ts` controla o lifecycle da página. Em qualquer `pagehide`, remove realmente os listeners Dexie, fecha o canal ativo e fecha a conexão. Se `persisted` for verdadeiro, registra um único `pageshow`; no retorno, reinstala um monitor e chama `open()` explicitamente. Cada restauração recebe uma geração e é serializada em relação à anterior. `pagehide` e `dispose` invalidam a geração corrente; o término de `open()` revalida geração, monitor e estado. Sucesso obsoleto fecha novamente o banco, enquanto rejeição obsoleta é ignorada. Falha da tentativa válida produz `reload-required`. Se a conexão tiver sido fechada deliberadamente por `versionchange` ou `DATABASE_UPGRADE_BLOCKED`, `reload-required` é terminal: os listeners Dexie e o canal são encerrados imediatamente, e o runtime não os reinstala nem mantém o banco reaberto. Não há sincronização de entidades por esse canal.

### Migrations

Mudanças de dados persistidos são versionadas. As migrations atuais cobrem:

- v2: soft delete de produtos;
- v3: preço decimal para centavos;
- v4: classificação de movimentações antigas como legadas;
- v5: categoria textual para entidade e `categoryId`;
- v6–v9: troca atômica de IDs numéricos por UUID em produtos e movimentações.

As migrations preservam dados conhecidos e abortam diante de situações que não podem ser convertidas com segurança. Não preenchem snapshots históricos desconhecidos nem inventam relações.

### Testes

A arquitetura é verificada por 44 arquivos e 439 testes aprovados:

- domínio e formatadores: regras puras;
- services/repositories: coordenação e persistência;
- Dexie/fake-indexeddb: transações, rollback, reabertura, migrations, `versionchange` e bloqueio entre conexões;
- React Testing Library/jsdom: consultas reativas, formulários e rotas.

Há testes unitários da conectividade, da política do service worker e da coordenação de atualização. Não há testes E2E/Playwright, automação de navegador offline, coverage ou CI.

## Fluxos atuais

### Leitura reativa

```text
Page
  → useDexieQuery
  → Service de consulta
  → Repository
  → Dexie / IndexedDB
  → liveQuery emite novo resultado
  → Page renderiza loading, error, empty ou success
```

As páginas principais tratam os quatro estados. “Success” é o estado em que os dados são renderizados; não existe um componente global com esse nome.

### Criação ou edição de produto

```text
ProductForm
  → validação de formulário e conversão de moeda
  → productService
  → validação de preço e categoria
  → productRepository
  → Dexie
```

O formulário usa uma trava em `useRef` e `isSubmitting` para impedir duplo envio enquanto a Promise está pendente. Cadastro/edição retorna feedback por navegação para a lista.

### Movimentação de estoque

```text
Movements
  → stockMovementService.register
  → transação Dexie
      → productRepository.findById
      → Domain.calculateStockSnapshot
      → productRepository.update
      → movementRepository.create
  → commit ou rollback integral
```

Uma saída inválida não atualiza o produto nem cria movimentação. A interface também bloqueia duplo envio, mas a integridade principal está no service/domain e na transação.

### Exclusão lógica

Produtos e categorias usam `deletedAt`; registros não são removidos fisicamente. Produtos excluídos saem das listagens e não aceitam novas movimentações, enquanto movimentos históricos continuam resolvíveis. Categoria só pode ser excluída se nenhum produto ativo a utilizar.

## Decisões de dados atuais

### UUIDs

Produto, Movimentação e Categoria usam `id: string` com UUID v4 gerado no cliente. `Movement.productId` também é string. Isso permite criar entidades offline sem depender de um servidor e reduz risco de colisão futura. Não implementa sincronização por si só. Ver o ADR de UUID.

### Valores monetários em centavos

Preço de venda é persistido em `salePriceInCents` como inteiro seguro não negativo. A UI aceita vírgula ou ponto com até duas casas e centraliza parse/formatação. Ver o ADR-001 de valores monetários em centavos.

### Snapshots de movimentação

Novos movimentos registram estoque anterior e resultante. Registros históricos sem dados suficientes usam `isLegacy: true` e não recebem valores inventados. Ver o ADR de snapshots.

### Categorias como entidades

Categoria possui identidade, timestamps, soft delete e `syncStatus`. Produto guarda apenas `categoryId?`. “Sem categoria” é texto de apresentação, não entidade. A resolução de nomes é feita em lote no service. Ver o ADR de categorias.

### Classificação de estoque

- `currentQuantity === 0`: sem estoque;
- `0 < currentQuantity <= minimumStock`: estoque baixo;
- `currentQuantity > minimumStock`: normal.

`needsRestock` inclui sem estoque e estoque baixo. A regra é centralizada em `src/domain/stockStatus.ts`.

### Auditabilidade do estoque e código interno

`currentQuantity` pode receber um saldo inicial somente na criação. Depois da persistência, a edição comum não aceita esse campo; entradas e saídas passam pelo `stockMovementService`, que calcula snapshots e usa a operação explícita `productRepository.updateStock()` dentro da mesma transação da movimentação.

`code` é uma referência interna opcional, não código de barras. A ausência é persistida como string vazia. O valor salvo recebe apenas trim externo e preserva caixa e caracteres internos; para unicidade entre produtos ativos, a comparação aplica trim e caixa insensível. Produtos excluídos não bloqueiam reutilização, e duplicidades legadas não são alteradas automaticamente porque histórico e identidade usam UUID.

## Offline-first atual

O IndexedDB continua sendo a fonte de verdade operacional. A outbox registra a intenção na mesma transação. O push remoto é uma ação manual adicional: não bloqueia o trabalho local, não altera entidades ao vincular contexto e não executa pull.

O `OfflineBanner` comunica que a aplicação continua usando os dados armazenados no dispositivo. Ele não promete sincronização, nuvem ou compartilhamento entre dispositivos.

O `DatabaseLifecycleBanner` distingue atualização necessária de upgrade bloqueado. A primeira condição oferece “Recarregar agora”; a segunda orienta fechar ou recarregar outras abas. Não existe reload automático: o gerenciador aceita a ação no máximo uma vez durante a vida da página.

## PWA no estado real

Implementado:

- `public/manifest.webmanifest`;
- `public/pwa-icon.svg`;
- `public/sw.js`;
- link do manifest em `index.html`;
- registro do service worker de módulo por `usePwaUpdate`, somente em produção;
- precache do `index.html`, com JavaScript e CSS descobertos no HTML tratados como essenciais para concluir o `install`; manifest e ícone permanecem opcionais;
- chaves de cache canônicas em URL absoluta, iguais na gravação do precache e na leitura de uma `Request` interceptada, sem `ignoreSearch`;
- fallback de `index.html` exclusivo para requisições de navegação da mesma origem;
- cache-first somente para caminhos estáticos conhecidos: `/assets/...`, manifest, ícone e o módulo de política do worker; `request.destination` não autoriza rotas arbitrárias;
- exclusão por padrão de `/api`, recursos externos, respostas privadas/não OK e métodos não GET;
- identificador de build determinístico calculado pelo Vite a partir dos arquivos efetivamente gerados e injetado em `sw.js` e `sw-policy.js`;
- cache isolado por versão no formato `stockflow-static-<build-id>`; um worker em instalação não escreve no cache do worker ativo;
- limpeza dos caches anteriores do prefixo `stockflow-` somente na ativação, preservando caches alheios;
- nova versão mantida em `waiting` até a ação “Atualizar agora”, que envia `{ type: 'SKIP_WAITING' }`;
- `controllerchange` recarrega uma única vez somente depois da solicitação do usuário.

Pendente:

- prompt/UX de instalação;
- persistência via StorageManager;
- teste E2E offline automatizado.

Portanto, PWA é **parcial**, não concluída.

## Proteção contra duplo envio

Está implementada em memória nos fluxos de:

- criação/edição de produto;
- criação/edição de categoria;
- registro de movimentação;
- exclusão de produto e categoria.

Cada fluxo combina `useRef` como trava imediata, estado `isSubmitting`/ID em exclusão e botões desabilitados. Isso protege a sessão atual da UI, mas não é idempotência persistente ou distribuída.

## Arquitetura de sincronização parcial

```text
React / PWA
    ↓
IndexedDB / Dexie + outbox local
    ↓ ação manual, sessão e business validados
manualPushService → syncRemoteGateway
    ↓ RPC idempotente/versionada ou RPC atômica de estoque
Supabase / PostgreSQL / Auth / RLS
```

A escrita continua local. O claim remoto filtra `userId`/`businessId`; eventos sem contexto não viram `processing`. A migration 6C cria `sync_operations` com chave `(business_id, idempotency_key)` e RPCs para create/update/soft delete de categorias/produtos. Updates exigem a `remoteVersion` arquivada pelo último evento `synced`; divergência vira erro amigável, não overwrite. Produtos atualizados nunca escrevem `current_quantity`.

A migration 6E amplia o ledger para `movement.created` e cria `register_stock_movement`. O gateway bloqueia movimentos legados/invalidos antes da rede. Na RPC, `auth.uid()` e membership são verificados explicitamente sob `SECURITY INVOKER`; a linha do produto no mesmo business é lida com `FOR UPDATE`; o saldo remoto precisa coincidir com `previousQuantity`; o servidor calcula e compara `resultingQuantity`; saída negativa é recusada; movimento, saldo, versão do produto e ledger são gravados atomicamente. Repetição de chave/payload retorna o resultado anterior; chave divergente falha. O app não altera o saldo local após o sucesso e não gera `product.updated` extra.

O claim transacional serializa execuções concorrentes no IndexedDB, inclusive entre conexões/abas, e evita a duplicação óbvia. `updatedAt` é usado como token simples para que sucesso ou falha não finalize um item recuperado concorrentemente. Isso não substitui idempotência no servidor nem um lock distribuído futuro; a validação manual entre abas permanece recomendada.

Implementado como preparação da Parte 5:

- cliente Supabase opcional e carregado apenas pela rota Conta;
- cadastro, login, sessão inicial, listener de Auth com cleanup e logout local;
- `.env.example` com URL e chave pública, sem segredo real;
- migration PostgreSQL versionada para perfis, estabelecimentos, memberships e entidades de estoque;
- `business_id`, `version`, índices, trigger de `updated_at`, soft delete e RLS baseada em `auth.uid()`.

Ainda não existem:

- aplicação/validação das migrations em um projeto remoto real;
- associação automática dos registros IndexedDB;
- pull, cursor ou retry automático;
- validação operacional da migration 6E e concorrência real entre dispositivos;
- armazenamento/resolução de conflitos;
- multiusuário ou multiestabelecimento.

Nada chama `manualPushService.push()` no boot, Auth, `onAuthStateChange`, retorno online ou timer. Somente o botão da Conta inicia o fluxo. A consulta de businesses também exige clique explícito. Não há `fetch` próprio, Service Worker Sync ou background sync.

## Continuidade oficial

O StockFlow é o TCC real e o Prompt Mestre, dividido oficialmente em 15 partes pelos intervalos de regras, é o plano oficial. As Partes 3 e 4 estão concluídas; a Parte 5 está concluída e validada. A Parte 6 avançou até a 6E com push parcial/manual e continua incompleta sem pull, conflitos reais ou automação. Snapshots não são Parte 4.

## Auth, sessão e isolamento remoto preparado

O fluxo da conta é `Account → useAuthSession → authService → cliente Supabase`. A rota é lazy; abrir as páginas locais não inicializa o módulo Supabase. Se as variáveis estiverem ausentes ou inválidas, a página explica a indisponibilidade e não bloqueia o restante do sistema. Uma sessão previamente persistida pelo cliente oficial pode ser restaurada offline; novos logins/cadastros exigem conectividade e logout usa escopo local para remover a sessão deste navegador.

Dados IndexedDB continuam device-scoped até uma ação consciente de associação da outbox. A seleção é isolada por usuário e revalidada por membership; logout limpa o contexto ativo. Eventos vinculados permanecem vinculados ao usuário/business original e não são reutilizados por outra conta.

## Backup e exportação

O fluxo é `UI → backupExportService → Dexie`. O acesso direto do service ao `localDb` é restrito à transação somente leitura que captura `categories`, `products` e `movements` como um único snapshot lógico; não foi criada uma abstração repository artificial para uma leitura atômica multi-tabela.

O backup representa dados do StockFlow em JSON, não estruturas internas do IndexedDB. O formato `stockflow-backup` v1 registra `exportedAt` e `databaseSchemaVersion: 9`, inclui soft deletes e valida UUIDs, relações, tipos, inteiros, datas e movimentos legados antes do download. Produtos e movimentações também podem ser exportados em CSV. O fluxo é local/offline, não faz chamadas de rede e fica indisponível quando o lifecycle do banco não está normal. Importação/restauração não foi implementada e permanece futura até haver estratégia rigorosamente validada.

## Referências arquiteturais

- `docs/prompt/PROMPT-MESTRE-STOCKFLOW.md` — princípios e direção oficial;
- `docs/arquitetura/adrs/ADR-001-valores-monetarios-em-centavos.md`;
- `docs/arquitetura/adrs/ADR-002-snapshots-de-estoque-nas-movimentacoes.md`;
- `docs/arquitetura/adrs/ADR-003-separacao-dominio-servicos-repositories.md`;
- `docs/arquitetura/adrs/ADR-004-categorias-como-entidades.md`;
- `docs/arquitetura/adrs/ADR-005-identificadores-uuid-para-produtos-e-movimentacoes.md`.

Este documento resume as decisões; os ADRs preservam contexto e consequências específicas e não são duplicados integralmente aqui.
