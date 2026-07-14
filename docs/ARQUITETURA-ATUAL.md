# Arquitetura Atual do StockFlow

> Estado comprovado em 14/07/2026 na branch `develop`, tendo `db1cbeb` como commit anterior à etapa atual ainda não commitada. Este documento descreve o que existe agora e separa explicitamente o planejamento futuro.

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
- `useOnlineStatus`: observa `navigator.onLine` e eventos `online`/`offline`.

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
- `syncService`: somente leitura de produtos e movimentações pendentes; não é sincronização funcional.

O `stockMovementService` usa `localDb.transaction('rw', ...)` porque precisa garantir atomicidade entre atualização do produto e criação da movimentação.

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

O schema atual é a versão 9 e contém `products`, `movements` e `categories`. A biblioteca Dexie instalada é 4.4.4.

### Migrations

Mudanças de dados persistidos são versionadas. As migrations atuais cobrem:

- v2: soft delete de produtos;
- v3: preço decimal para centavos;
- v4: classificação de movimentações antigas como legadas;
- v5: categoria textual para entidade e `categoryId`;
- v6–v9: troca atômica de IDs numéricos por UUID em produtos e movimentações.

As migrations preservam dados conhecidos e abortam diante de situações que não podem ser convertidas com segurança. Não preenchem snapshots históricos desconhecidos nem inventam relações.

### Testes

A arquitetura é verificada por 17 arquivos e 141 testes aprovados:

- domínio e formatadores: regras puras;
- services/repositories: coordenação e persistência;
- Dexie/fake-indexeddb: transações, rollback, reabertura e migrations;
- React Testing Library/jsdom: consultas reativas, formulários e rotas.

Não há testes E2E, offline/service worker, coverage ou CI.

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

Preço de venda é persistido em `salePriceInCents` como inteiro seguro não negativo. A UI aceita vírgula ou ponto com até duas casas e centraliza parse/formatação. Ver o ADR de valores monetários; seu nome de arquivo e título interno têm numeração divergente.

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

O IndexedDB é a fonte de verdade operacional. O usuário consegue trabalhar com dados locais sem aguardar rede. As entidades novas recebem `syncStatus: "pending"`, mas não existe outbox nem envio.

Há uma limitação de comunicação: `OfflineBanner` diz que alterações serão sincronizadas quando a conexão voltar. Como isso ainda não acontece, o texto deve ser corrigido em uma etapa de código futura, não nesta etapa documental.

## PWA no estado real

Implementado:

- `public/manifest.webmanifest`;
- `public/pwa-icon.svg`;
- `public/sw.js`;
- link do manifest em `index.html`;
- registro do service worker em `src/main.tsx`;
- cache inicial de `/`, `/index.html`, manifest e ícone;
- cache dinâmico e fallback para `index.html`.

Pendente:

- prompt/UX de instalação;
- atualização segura e aviso de nova versão;
- cache limitado por origem/tipo/status;
- política para dados privados futuros;
- persistência via StorageManager;
- backup/exportação;
- teste offline automatizado e validação do build implantado.

Portanto, PWA é **parcial**, não concluída.

## Proteção contra duplo envio

Está implementada em memória nos fluxos de:

- criação/edição de produto;
- criação/edição de categoria;
- registro de movimentação;
- exclusão de produto e categoria.

Cada fluxo combina `useRef` como trava imediata, estado `isSubmitting`/ID em exclusão e botões desabilitados. Isso protege a sessão atual da UI, mas não é idempotência persistente ou distribuída.

## Arquitetura futura — apenas planejamento

```text
React / PWA
    ↓
IndexedDB / Dexie
    ↓
futura outbox e sincronização bidirecional
    ↓
Supabase / PostgreSQL / Auth / RLS
```

No plano futuro, a escrita continuará local e uma outbox persistente deverá conduzir push, confirmação, retry e conflitos. Pull deverá trazer mudanças remotas validadas para uma transação local. Auth e RLS deverão identificar usuário/estabelecimento e isolar dados.

Nada dessa camada remota está implementado. Em particular, não existem:

- client Supabase ou variáveis de ambiente;
- schema/migrations PostgreSQL;
- autenticação ou sessão offline autenticada;
- RLS;
- outbox;
- push, pull, retry ou cursor;
- armazenamento/resolução de conflitos;
- multiusuário ou multiestabelecimento.

O arquivo `syncService.ts` não muda esse estado: ele apenas devolve arrays locais de produtos e movimentações pendentes.

## Referências arquiteturais

- `docs/prompt/PROMPT-MESTRE-STOCKFLOW.md` — princípios e direção oficial;
- `docs/arquitetura/adrs/ADR-001-valores-monetarios-em-centavos.md`;
- `docs/arquitetura/adrs/ADR-002-snapshots-de-estoque-nas-movimentacoes.md`;
- `docs/arquitetura/adrs/ADR-003-separacao-dominio-servicos-repositories.md`;
- `docs/arquitetura/adrs/ADR-004-categorias-como-entidades.md`;
- `docs/arquitetura/adrs/ADR-005-identificadores-uuid-para-produtos-e-movimentacoes.md`.

Este documento resume as decisões; os ADRs preservam contexto e consequências específicas e não são duplicados integralmente aqui.
