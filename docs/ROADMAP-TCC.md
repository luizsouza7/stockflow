# Roadmap TCC — StockFlow

> Atualizado em 14/07/2026. O planejamento oficial é `docs/prompt/PROMPT-MESTRE-STOCKFLOW.md`. O Prompt atual organiza o trabalho por milestones M1–M11 e fases 0–11, mas não apresenta uma lista literalmente numerada de 15 partes. As 15 partes abaixo são uma correspondência operacional conservadora para continuidade, baseada nessas seções e no histórico comprovado; não substituem nem ampliam arbitrariamente o Prompt Mestre.

## Como interpretar os status

- **não iniciada:** não há implementação comprovada;
- **iniciada:** há preparação ou um subconjunto pequeno;
- **avançada:** parte substancial existe, mas faltam critérios relevantes;
- **praticamente concluída:** resta estabilização/documentação pontual, sem grande núcleo funcional ausente;
- **concluída:** objetivos delimitados da parte foram comprovados no repositório.

Não são usados percentuais artificiais.

## Sequência principal e trabalho transversal

A sequência principal continua ordenada. Conforme o contexto oficial de continuidade fornecido pelo desenvolvedor, a **Parte 3 foi concluída**. Testes, documentação e qualidade continuam sendo usados transversalmente sem deslocar a parte principal:

- testes foram escritos desde as primeiras regras críticas, antes da Parte 8 formal;
- ADRs foram criados junto das migrations e decisões, antes da Parte 10 formal;
- lint, typecheck, testes e build são critérios usados antes da Parte 13 formal;
- uma PWA básica já existia antes do endurecimento formal da Parte 9.

Isso preserva qualidade e rastreabilidade durante o desenvolvimento. Não significa que testes, documentação, PWA ou qualidade/CI estejam completos.

## Parte 1 — Auditoria e baseline

**Objetivo:** conhecer o repositório real, stack, funcionalidades, riscos e lacunas antes de evoluir o sistema, conforme Fase 0 do Prompt Mestre.

**Status:** concluída.

**Já implementado/comprovado:**

- auditoria registrada em `docs/auditoria-fase-0.md`;
- inventário de stack, funcionalidades locais, riscos de dados, PWA e sync;
- identificação inicial das prioridades de integridade.

**Restante:**

- não repetir a auditoria completa sem mudança relevante;
- tratar o documento como registro histórico, pois a raiz nele está antiga e várias lacunas já foram resolvidas.

## Parte 2 — Integridade local e regras críticas

**Objetivo:** consolidar regras de entrada/saída, atomicidade, rollback, soft delete e testes do banco local.

**Status:** concluída.

**Já implementado/comprovado:**

- transação Dexie para atualizar estoque e criar movimentação;
- bloqueio de saída maior que o disponível;
- validação de quantidade inteira positiva;
- soft delete de produto com histórico preservado;
- testes com fake-indexeddb para entrada, saída, rollback e persistência.

**Restante:**

- melhorias futuras de auditabilidade, como impedir alteração direta de estoque sem movimentação, pertencem à estabilização do domínio e não invalidam o núcleo concluído desta parte.

## Parte 3 — Consolidação funcional do núcleo local

**Objetivo:** consolidar o núcleo local do TCC, incluindo integridade monetária e uma experiência de consulta útil para produtos e movimentações.

**Status:** concluída.

**Já implementado/comprovado:**

- `salePriceInCents` como inteiro seguro não negativo;
- parse e formatação centralizados;
- migration Dexie v3;
- testes de conversão, rejeição de entradas inválidas e reedição sem multiplicação.
- busca de produtos por nome e código, sem distinção de caixa e com espaços externos ignorados;
- filtros combináveis de produtos por categoria e situação centralizada de estoque;
- ordenação de produtos por nome, estoque, preço e atualização;
- filtros combináveis de movimentações por produto, tipo e período local inclusivo;
- ordenação cronológica, validação de intervalo e preservação de legado, snapshots e histórico de produtos excluídos;
- estados vazios reais distintos de consultas sem correspondência;
- layout de filtros validado sem overflow em 375 px e 1440 px.
- saldo inicial permitido somente na criação e validado como inteiro não negativo;
- edição comum sem campo mutável de estoque e DTO de update sem `currentQuantity`;
- alterações posteriores de estoque restritas ao fluxo transacional de movimentações;
- código definido como referência interna opcional, persistida como string vazia quando ausente;
- trim na persistência e comparação lógica case-insensitive entre produtos ativos;
- reutilização do código após soft delete e preservação não destrutiva de duplicidades legadas.

**Restante:**

- custo de produto, código de barras e outras grandezas monetárias não fazem parte do escopo delimitado desta parte;
- a numeração divergente do ADR monetário é uma correção documental futura e não impede o encerramento funcional.

## Parte 4 — Snapshots e rastreabilidade das movimentações

**Objetivo:** registrar estoque anterior/resultante sem inventar dados históricos.

**Status:** concluída.

**Já implementado/comprovado:**

- `previousQuantity` e `resultingQuantity` em novas movimentações;
- tipo discriminado entre movimento rastreável e legado;
- migration v4 marcando legado sem fabricar snapshot;
- apresentação do snapshot ou aviso de legado no histórico;
- testes de cálculo, encadeamento, migration e preservação.

**Restante:**

- eventual ajuste de estoque deve ser modelado como nova movimentação em parte futura, se o requisito for confirmado.

## Parte 5 — Separação Domain, Services e Repositories

**Objetivo:** retirar regras e consultas diretas das páginas, mantendo uma arquitetura simples e testável.

**Status:** concluída.

**Já implementado/comprovado:**

- fluxo `UI → Service → Repository → Dexie`;
- domínio puro para estoque, movimento e categoria;
- `localDb.ts` concentrado em schema/migrations/instância;
- dashboard e alertas consumindo services/regras centralizadas;
- ADR arquitetural correspondente.

**Restante:**

- evitar abstrações genéricas até existir uma necessidade remota real;
- manter a separação nas próximas funcionalidades.

## Parte 6 — Categorias como entidades

**Objetivo:** substituir texto livre por categoria identificável, gerenciável e adequada à criação offline.

**Status:** concluída.

**Já implementado/comprovado:**

- entidade `Category` com UUID, timestamps, soft delete e `syncStatus`;
- cadastro, edição, listagem e exclusão lógica;
- sanitização, limite e unicidade lógica do nome;
- associação opcional de produto a categoria ativa;
- bloqueio de exclusão quando há produto ativo;
- migration v5 do texto legado e testes.

**Restante:**

- nenhum item funcional restante no recorte de categorias desta parte operacional.

## Parte 7 — UUIDs e robustez dos fluxos locais

**Objetivo:** eliminar IDs locais autoincrementais das entidades sincronizáveis e tornar consultas/formulários/rotas resistentes a falhas e duplicidade de envio.

**Status:** praticamente concluída.

**Já implementado/comprovado:**

- UUID para Produto, Movimentação e Categoria;
- `Movement.productId` em string;
- migration técnica v6–v9 com preservação e rollback;
- estados loading/error/empty nas páginas principais;
- tratamento de produto inexistente ou excluído em edição;
- feedback de sucesso/erro;
- proteção de duplo envio e exclusão;
- último commit anterior à etapa atual: `db1cbeb`; a evolução atual permanece sem commit conforme solicitado.

**Restante:**

- aplicar acessibilidade e tratamento de erro restantes sem ampliar escopo;
- considerar esta parte encerrada somente após a revisão do desenvolvedor.

## Parte 8 — Estratégia formal de testes

**Objetivo:** consolidar testes unitários, banco local, componentes e fluxos essenciais; preparar E2E conforme Fase 10 do Prompt Mestre.

**Status:** avançada.

**Já implementado/comprovado:**

- Vitest, fake-indexeddb, jsdom e React Testing Library;
- 17 arquivos e 141 testes aprovados;
- regras de estoque, categorias, moeda e status;
- transações, rollback, soft delete e migrations;
- repository/service/dashboard;
- hook reativo, formulários e rotas críticas.

**Restante:**

- mapear lacunas por requisito e risco;
- ampliar testes de componentes para dashboard, alertas e falhas ainda não cobertas;
- adicionar E2E com Playwright para produto, estoque, alertas e offline quando a etapa autorizar dependências;
- testar service worker/PWA em ambiente de build;
- decidir coverage realista e documentar resultados;
- não criar testes de sync/auth antes de essas funcionalidades existirem.

## Parte 9 — PWA e operação offline endurecida

**Objetivo:** transformar a PWA básica em experiência offline comprovada e segura, conforme Fase 6.

**Status:** iniciada.

**Já implementado/comprovado:**

- manifesto, ícone, service worker e registro;
- cache inicial e indicador online/offline;
- operações de dados locais independentes de backend.

**Restante:**

- restringir cache dinâmico e respostas elegíveis;
- validar app shell e navegação offline no build;
- implementar atualização segura com aviso;
- revisar texto do banner para não prometer sincronização inexistente;
- estudar persistência, instalação, backup/exportação e riscos do IndexedDB;
- criar testes offline.

## Parte 10 — Documentação técnica, acadêmica e ADRs

**Objetivo:** manter arquitetura, requisitos, decisões e entrega acadêmica rastreáveis.

**Status:** avançada.

**Já implementado/comprovado:**

- Prompt Mestre;
- auditoria histórica;
- cinco arquivos de ADR;
- documentos de estado, arquitetura, roadmap e continuidade criados nesta etapa;
- README inicial.

**Restante:**

- corrigir inconsistências documentais de raiz, numeração de ADR e README desatualizado em etapa autorizada;
- requisitos funcionais/não funcionais e regras de negócio formais;
- histórias, casos de uso e matriz de rastreabilidade;
- diagramas coerentes com o código;
- documentação e checklist da entrega PI2;
- estrutura acadêmica do TCC sem inventar dados ou resultados.

## Parte 11 — Supabase, PostgreSQL, Auth e RLS

**Objetivo:** introduzir backend, autenticação e isolamento por estabelecimento com migrations seguras.

**Status:** não iniciada.

**Já implementado/comprovado:**

- apenas decisões locais que facilitam evolução: UUID, timestamps, soft delete e `syncStatus`.

**Restante:**

- client/configuração/env;
- schema PostgreSQL e migrations;
- Auth, sessão, onboarding, perfis, estabelecimentos e memberships;
- proteção de rotas;
- RLS e testes de isolamento;
- nenhuma credencial deve ser inventada ou versionada.

## Parte 12 — Sincronização bidirecional e outbox

**Objetivo:** implementar fila persistente, push, pull, confirmação, retry e status real.

**Status:** não iniciada.

**Já implementado/comprovado:**

- `syncStatus` nas entidades;
- `syncPendingData()` lista produtos e movimentos pendentes, sem efeito remoto.

Esses itens são preparação, não sincronização.

**Restante:**

- entidade/store de outbox;
- escrita atômica de entidade + item da fila;
- engine de push/pull, cursores e confirmação;
- retry/backoff e estados;
- categorias e demais entidades no fluxo;
- UX de última sincronização e erros;
- testes unitários, integração e offline.

## Parte 13 — Qualidade, segurança e CI

**Objetivo:** formalizar os critérios de pronto e automatizar lint, typecheck, testes e build.

**Status:** iniciada.

**Já implementado/comprovado:**

- TypeScript estrito;
- ESLint;
- scripts `lint`, `typecheck`, `test` e `build`;
- uso desses comandos como protocolo de conclusão.

**Restante:**

- executar e registrar a suíte completa em cada etapa de código;
- configurar GitHub Actions/CI;
- avaliar Prettier sem conflito ou formatação massiva;
- Error Boundary, acessibilidade e testes responsivos;
- revisão de segurança do service worker e futura camada remota;
- templates de issue/PR quando úteis.

## Parte 14 — Concorrência e conflitos

**Objetivo:** detectar, armazenar e resolver conflitos relevantes após existir sincronização real.

**Status:** não iniciada.

**Já implementado/comprovado:**

- snapshots e UUIDs fornecem contexto local útil, mas não são mecanismo de conflito.

**Restante:**

- versionamento remoto e precondições;
- função atômica de movimentação no PostgreSQL;
- detecção e registro de conflito;
- política por entidade;
- central de conflitos e resolução;
- testes de concorrência.

## Parte 15 — Validação acadêmica, estabilização e releases

**Objetivo:** validar o sistema com público-alvo, analisar resultados e preparar entregas PI2/TCC reproduzíveis.

**Status:** não iniciada.

**Já implementado/comprovado:**

- contexto, tema, objetivo e público-alvo preliminares estão no Prompt Mestre/README.

**Restante:**

- instrumentos de entrevista/questionário e consentimento revisados;
- plano de testes de usabilidade;
- coleta real, sem respostas inventadas;
- análise dos resultados e limitações;
- documentação final, screenshots e demonstração;
- release/tag PI2 estável e release 1.0 do TCC após critérios reais.

# Próximas etapas planejadas

1. Revisar os critérios da **Parte 4** do Prompt Mestre contra snapshots e legado já implementados, evitando refazer trabalho concluído.
2. Retomar a **Parte 8** transversal com uma análise de lacunas de testes baseada nos fluxos reais e preparar E2E/offline sem testar funcionalidades inexistentes.
3. Avançar a **Parte 9**: restringir e testar a PWA/offline, corrigindo mensagens que hoje prometem sincronização.
4. Completar progressivamente a **Parte 10** para a entrega PI2: requisitos, rastreabilidade, diagramas e checklist, sem substituir o Prompt Mestre.
5. Somente depois da base local/PI2 estabilizada, iniciar **Parte 11**; Supabase/Auth/RLS devem preceder sincronização real.
6. Seguir então por **Parte 12**, **Parte 13**, **Parte 14** e **Parte 15**, respeitando dependências e critérios de pronto.

O próximo passo recomendado não é Supabase nem sincronização: é verificar formalmente o estado da Parte 4 antes de escolher uma nova evolução.
