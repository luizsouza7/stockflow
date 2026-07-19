# Estado Atual do Projeto StockFlow

> Consolidado em 17/07/2026. Este documento descreve o estado funcional atual na branch `develop`. Em caso de divergência futura, o código, os testes executados e o histórico Git prevalecem; hashes e histórico de commits devem ser consultados no Git.

## Identificação e finalidade

O StockFlow é um sistema web responsivo de controle de estoque para pequenos comércios. Seu objetivo principal é permitir o cadastro e a consulta de produtos, a organização por categorias, o registro de entradas e saídas, a preservação do histórico e a identificação de estoque baixo mesmo quando o dispositivo está sem conexão.

O StockFlow é o Trabalho de Conclusão de Curso real. Por decisão atual do responsável, não deve ser tratado, planejado ou apresentado como Projeto Integrador. O título acadêmico provisório definido no Prompt Mestre é **“StockFlow: desenvolvimento de um sistema web responsivo para controle de estoque de pequenos comércios com funcionamento offline e sincronização em nuvem”**. A sincronização em nuvem pertence ao planejamento futuro; não está implementada.

## Referência desta fotografia

- Raiz Git verificada: `C:/Users/lufel/Desktop/TCC/StockFlow`.
- Branch verificada: `develop`.
- Etapa funcional atual: Parte 6A com outbox local transacional; Auth e SQL PostgreSQL/RLS da Parte 5 permanecem preservados, sem sincronização remota.
- O estado do worktree e os commits de referência devem ser verificados diretamente com Git a cada retomada.
- Versão do projeto em `package.json`: `0.1.0`.

## Stack atual comprovada

- React 18.3.1 e React DOM 18.3.1;
- TypeScript 5.6.3 em modo estrito;
- Vite 6.4.3 e `@vitejs/plugin-react` 4.7.0 instalados;
- React Router DOM 6.30.4 instalado;
- Tailwind CSS 3.4.19, PostCSS 8.5.16 e Autoprefixer 10.5.2 instalados;
- Dexie 4.4.4 instalado sobre IndexedDB; `package.json` declara `dexie: ^4.0.11`;
- cliente oficial `@supabase/supabase-js` 2.110.7, carregado sob demanda pela página Conta;
- Vitest 4.1.10, React Testing Library 16.3.2, jsdom 28.1.0 e fake-indexeddb 6.2.5;
- ESLint 9.39.4 com plugins de React Hooks e React Refresh;
- npm com `package-lock.json` no formato 3.

Os números instalados acima foram confirmados com `npm ls --depth=0`. As faixas declaradas permanecem registradas em `package.json` e `package-lock.json`.

## Arquitetura atual

O fluxo predominante implementado é:

```text
Pages/UI → Services → Repositories → Dexie/IndexedDB
               ↓
            Domain
```

- `src/pages` e `src/components` renderizam e coletam interação do usuário;
- `src/hooks` concentra consultas reativas ao Dexie, conectividade e apresentação do lifecycle do banco;
- `src/domain` contém regras puras de categorias, movimentações e classificação de estoque;
- `src/services` valida e coordena casos de uso;
- `src/repositories` realiza acesso direto às tabelas;
- `src/services/db/localDb.ts` define banco, schemas, migrations e instância Dexie.

O `stockMovementService` conhece deliberadamente a instância Dexie para delimitar uma transação atômica que atualiza o produto e cria a movimentação. Detalhes estão em `docs/ARQUITETURA-ATUAL.md` e no ADR de separação de responsabilidades.

## Abordagem offline-first e PWA

As leituras e mutações principais usam IndexedDB local como fonte de dados. As consultas da interface são reativas por `liveQuery`. Cadastro, edição, exclusão lógica, categorias e movimentações não dependem de um backend.

Existe uma **PWA parcial com cache e atualização controlados**:

- manifesto web;
- ícone SVG;
- registro do service worker somente no build de produção;
- app shell preparado com HTML, JavaScript e CSS essenciais aguardados durante a instalação e chaves absolutas canônicas no cache;
- cache restrito a navegações e caminhos estáticos conhecidos da própria aplicação;
- identificador determinístico derivado dos artefatos do build e caches isolados por versão;
- aviso de nova versão e atualização consciente via worker em `waiting`;
- indicador baseado em `navigator.onLine` e eventos `online`/`offline`, com cleanup testado.
- aviso de lifecycle do armazenamento para `versionchange` e upgrade bloqueado, sem reload automático.

`navigator.onLine` indica somente a conectividade percebida pelo navegador; não comprova acesso completo à internet nem disponibilidade de backend. Futuras APIs, respostas privadas/autenticadas, recursos externos e métodos mutáveis não são cacheados pela estratégia atual. A instalação limpa, o primeiro reload offline e o ciclo real de atualização A → B com preservação do IndexedDB foram validados manualmente. Ainda não há solicitação via StorageManager ou teste E2E automatizado.

## Banco local, entidades e identificadores

### Dexie

- Biblioteca instalada: Dexie 4.4.4.
- Nome padrão do banco: `stockflow-local-db`.
- **Versão real atual do schema local: 10**.
- Tabelas finais: `products`, `movements` e `categories`.
- A instância central possui coordenação de lifecycle sem criar banco, tabela ou migration adicional.

### Entidades existentes

| Entidade | Tipo do ID atual | Relações e observações |
| --- | --- | --- |
| `Product` | `string`, UUID v4 gerado no cliente | Pode ter `categoryId?: string`; usa soft delete e preço em centavos. |
| `Movement` | `string`, UUID v4 gerado no cliente | `productId: string`; pode ser rastreável com snapshots ou legada sem snapshots. |
| `Category` | `string`, UUID v4 gerado no cliente | Soft delete; produtos sem categoria usam `categoryId` ausente. |

Os UUIDs são gerados por `crypto.randomUUID()` através de `src/utils/id.ts`. Existe uma outbox local, mas não existem entidades locais para estabelecimento, perfil, associação de usuário ou conflito. `userId` e `businessId` são opcionais na outbox e não são preenchidos sem vínculo seguro. O SQL futuro modela estabelecimentos e memberships sem associar automaticamente os dados device-scoped atuais.

## Migrations existentes

| Versão | Situação comprovada |
| --- | --- |
| 1 | Schema inicial de produtos e movimentações com chaves numéricas autoincrementais. |
| 2 | Adição de `deletedAt` em produtos para soft delete. |
| 3 | Conversão do antigo `price` decimal em `salePriceInCents`; valor inválido aborta a migration. |
| 4 | Movimentações antigas sem snapshots passam a `isLegacy: true`; snapshots não são inventados. |
| 5 | Criação de categorias como entidades e conversão de `category` textual em `categoryId`. |
| 6 | Validação e cópia de produtos/movimentações para stores temporárias com UUID. |
| 7 | Remoção das stores antigas com primary key autoincremental. |
| 8 | Recriação de `products` e `movements` com primary key UUID e restauração dos dados. |
| 9 | Remoção das stores temporárias; schema final contém somente as três tabelas públicas. |
| 10 | Adição isolada da store `outbox`; as tabelas de domínio são preservadas e a fila começa vazia no upgrade. |

As versões 6 a 9 formam uma única sequência técnica de upgrade por limitação do IndexedDB/Dexie ao trocar a primary key; nenhuma migration antiga foi alterada. A v10 adiciona somente a outbox. Os testes verificam fresh install, v9 → v10, preservação, reabertura, igualdade do schema final e rollback diante de referência órfã. Há também um teste permanente do caminho completo v1 → v10, com produto, preço histórico, quantidade, categoria, movimentação e relação entre IDs preservados.

## Regras de negócio consolidadas

- Quantidades atuais, mínimas e movimentadas devem ser inteiras; estoque e mínimo não podem ser negativos nos formulários atuais.
- Entrada soma ao estoque; saída subtrai.
- Quantidade de movimentação deve ser inteira e maior que zero.
- Saída maior que o estoque disponível é recusada.
- Atualização de estoque e criação da movimentação ocorrem na mesma transação Dexie.
- Nova movimentação registra `previousQuantity` e `resultingQuantity`.
- Movimentações antigas sem informação suficiente permanecem legadas, sem snapshots fabricados.
- Produto excluído logicamente deixa a listagem ativa, não aceita nova movimentação e mantém o histórico.
- Estoque zero é `out-of-stock`; estoque positivo menor ou igual ao mínimo é `low-stock`; os dois precisam de reposição.
- Preço de venda é persistido como inteiro não negativo em `salePriceInCents` e formatado em real brasileiro na UI.
- Categoria tem nome sanitizado, obrigatório, com até 80 caracteres e unicidade lógica entre categorias ativas.
- Categoria não pode ser excluída enquanto estiver associada a produto ativo.
- Produto novo ou editado somente pode apontar para categoria ativa existente; produto sem categoria é permitido.
- Novos produtos, categorias e movimentações recebem UUID no cliente.
- Mutações locais marcam `syncStatus: "pending"`, mas esse status ainda não é consumido por uma sincronização real.

## ADRs existentes

Há 5 arquivos de ADR em `docs/arquitetura/adrs`:

1. `ADR-001-valores-monetarios-em-centavos.md`;
2. `ADR-002-snapshots-de-estoque-nas-movimentacoes.md`;
3. `ADR-003-separacao-dominio-servicos-repositories.md`;
4. `ADR-004-categorias-como-entidades.md`;
5. `ADR-005-identificadores-uuid-para-produtos-e-movimentacoes.md`.

O título interno do primeiro ADR está alinhado ao nome do arquivo como `ADR-001`.

## Testes comprovados

- Arquivos de teste atuais: **34**.
- Testes aprovados em 17/07/2026: **307 de 307**.
- Comando: `npm run test`.
- Cobertura existente: regras puras, formatação monetária, repository de produtos, services de categorias e dashboard, transações e migrations Dexie, hook reativo e robustez de formulários/rotas.
- Existem testes unitários da política de cache, do gerenciador de atualização, da conectividade, dos banners e do lifecycle do IndexedDB. Um teste com fake-indexeddb mantém uma conexão antiga aberta, observa o bloqueio real e confirma a liberação do upgrade após o fechamento. Testes de página comprovam cleanup em `pagehide`, reabertura explícita e preservação de dados após BFCache, ausência de listeners/canais duplicados, invalidação de `open()` pendente por estado terminal ou novo `pagehide` e proibição de conexão reaberta em `reload-required`. Ainda não existem Playwright/E2E, automação de navegador para o fluxo offline/instalação, coverage configurada ou CI.

## Estado das funcionalidades

### Concluído no escopo local comprovado

- layout responsivo com navegação desktop e mobile;
- rotas para dashboard, produtos, categorias, movimentações e alertas;
- listagem, cadastro, edição, busca por nome/código, filtros por categoria e estoque, ordenação e soft delete de produtos;
- CRUD local de categorias com regras de nome e exclusão lógica;
- associação opcional de produto a categoria ativa;
- saldo inicial definido somente na criação e alterações posteriores de estoque restritas a movimentações;
- código interno opcional, com trim e unicidade lógica entre produtos ativos;
- entradas e saídas atômicas com bloqueio de estoque negativo;
- histórico local preservado, inclusive para produto excluído;
- filtros combináveis do histórico por produto, tipo e período, com ordenação cronológica;
- snapshots nas novas movimentações e tratamento explícito dos registros legados;
- valores monetários em centavos;
- UUIDs para as três entidades, incluindo migration de dados antigos;
- classificação centralizada de estoque;
- dashboard local básico e alertas de reposição;
- estados reutilizáveis de loading, erro e vazio nas principais consultas;
- feedback de sucesso/erro e proteção em memória contra duplo envio nos formulários e exclusões principais;
- tratamento explícito de `versionchange`, upgrade bloqueado e coordenação de lifecycle entre abas, com reload apenas por ação do usuário;
- backup JSON versionado e exportação CSV local de produtos e movimentações, com validação e snapshot somente leitura;
- Auth opcional por e-mail/senha, sessão inicial, listener com cleanup e logout local;
- migration PostgreSQL versionada com isolamento por estabelecimento e RLS preparada;
- suíte atual de 307 testes em 37 arquivos aprovada.

“Concluído” acima significa concluído no escopo local atualmente implementado, não conclusão do produto TCC.

### Parcial

- **TCC:** o núcleo local demonstrável existe, mas a PWA/offline ainda é parcial e as camadas remota, acadêmica e de validação permanecem incompletas.
- **PWA/offline:** manifesto, cache restrito, indicador testado, atualização controlada, lifecycle robusto do IndexedDB e backup/exportação local existem; validação E2E automatizada permanece pendente.
- **Produtos:** busca, filtros combináveis, ordenação, estados vazios, código interno único entre ativos e proteção contra edição direta de estoque estão implementados.
- **Movimentações:** entrada, saída, histórico e filtros combináveis por produto/tipo/período estão implementados; eventual movimento de ajuste permanece futuro.
- **Dashboard:** usa dados reais e exibe separadamente produtos com estoque baixo e sem estoque; entradas/saídas por período permanecem futuras.
- **Feedback e erros:** melhorados nas páginas principais, mas não há Error Boundary nem uma taxonomia completa por origem.
- **Testes:** há boa cobertura local e alguns testes de componente, porém faltam E2E, offline/PWA, coverage e CI.
- **Preparação para sync:** entidades têm UUID e `syncStatus`; a outbox recebe categorias, produtos e movimentações; `getLocalSyncPreparationStatus()` expõe somente um resumo local.
- **Documentação:** Prompt Mestre, auditoria, ADRs e estes arquivos existem; a documentação acadêmica, requisitos, rastreabilidade, diagramas e resultados ainda não estão completos.

### Pendente / não implementado

- aplicação e validação da migration em um projeto Supabase real;
- associação dos dados locais a uma conta/estabelecimento;
- sincronização real, bidirecional, push e pull;
- processamento remoto da outbox persistente;
- retry, confirmação de envio e cursor de pull;
- detecção, persistência e resolução de conflitos;
- central/status real de sincronização;
- importação/restauração de backup;
- relatórios avançados;
- testes E2E com Playwright;
- GitHub Actions/CI;
- pesquisa com público-alvo, testes de usabilidade e análise de resultados;
- release final do TCC baseada em critérios reais.

## Limitações e dívidas técnicas conhecidas

- `navigator.onLine` indica conectividade do navegador, não disponibilidade de backend.
- O dataset IndexedDB permanece vinculado ao dispositivo, não à conta autenticada; logout remove a sessão da interface, mas não apaga nem reatribui dados locais.
- Auth/RLS possuem testes com mocks e validação estática; o comportamento real entre usuários ainda precisa ser validado em projeto Supabase de teste.
- A coordenação de múltiplas abas possui cobertura automatizada; a v10 é um upgrade legítimo para a outbox e ainda deve ser conferida manualmente em navegador real.
- Duplicidades legadas de código são preservadas; a regra impede novas duplicidades ativas, mas não corrige dados históricos automaticamente.
- A unicidade local por código é validada no service e não cobre concorrência futura com nuvem ou múltiplos dispositivos.
- Soft delete de produto não valida previamente se o registro já está excluído; a UI evita o fluxo comum, mas a regra poderia ser mais explícita.
- `getLocalSyncPreparationStatus()` não envia, recebe ou confirma registros.
- `syncStatus` e a outbox sustentam a fundação local, mas ainda não existe retry ativo, confirmação remota ou semântica operacional completa.
- Não há Error Boundary, coverage, Prettier, E2E ou CI.
- O README foi atualizado para representar o núcleo local, a arquitetura, as migrations, a suíte atual, as limitações e o roadmap oficial.
- `docs/auditoria-fase-0.md` registra uma raiz antiga e lacunas que já foram resolvidas; deve ser lido como registro histórico, não como fotografia atual.
- A numeração interna do ADR-001 foi corrigida nesta consolidação documental, sem alteração técnica da decisão.

## Continuidade dentro das 15 partes

O Prompt Mestre é o planejamento oficial. Sua divisão oficial é por intervalos de regras: Parte 1 (1–11), Parte 2 (12–18), Parte 3 (19–29), Parte 4 (30–35), Parte 5 (36–42), Parte 6 (43–54), Parte 7 (55–69), Parte 8 (70–79), Parte 9 (80–86), Parte 10 (87–98), Parte 11 (99–106), Parte 12 (107–118), Parte 13 (119–128), Parte 14 (129–138) e Parte 15 (139–143).

- Última etapa funcional consolidada: distinção textual e visual entre estoque normal, baixo e zerado no dashboard, produtos e alertas, após as validações defensivas de produto e a troca reativa de consulta.
- Parte principal atual: **Parte 3 concluída**.
- Pendências conhecidas das regras 19–29: nenhuma.
- Elementos transversais já utilizados: testes da Parte 8, documentação/ADRs da Parte 10 e critérios de qualidade da Parte 13.
- Parte 4: **concluída**; regras 30–35 implementadas no escopo local.
- Parte 5: **em andamento**; regras 36–42 implementadas em código e SQL, aguardando validação manual em projeto Supabase real.
- Parte 6: **iniciada somente na fatia 6A**; outbox local, contratos, status honesto e testes implementados. Push, pull, retry ativo, conflitos, concorrência remota e RPC não foram implementados.
- Próximo passo recomendado: revisar a 6A e validar o upgrade v9 → v10 entre abas em navegador real; qualquer fatia remota posterior exige autorização separada.

Nenhuma parte futura deve ser considerada concluída apenas porque algum de seus critérios foi usado transversalmente.
