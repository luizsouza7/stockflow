# Roadmap TCC — StockFlow

> Consolidado em 15/07/2026. O StockFlow é o TCC real. O planejamento oficial é o `docs/prompt/PROMPT-MESTRE-STOCKFLOW.md`, dividido nas 15 partes abaixo pelos intervalos de regras definidos pelo responsável pelo projeto.

## Como interpretar o roadmap

- **não iniciada:** não há implementação comprovada;
- **iniciada:** existe preparação ou um subconjunto do objetivo;
- **avançada:** parte substancial existe, mas permanecem critérios relevantes;
- **praticamente concluída:** o núcleo existe e restam correções delimitadas;
- **concluída:** o objetivo delimitado foi comprovado, sem pendência conhecida que impeça o encerramento.

Não são usados percentuais. As “fases” das regras 107–118 e os milestones citados no Prompt Mestre são conteúdo da Parte 12 e não substituem esta sequência oficial.

## Sequência principal e elementos transversais

A **Parte 3 está concluída**. Testes, documentação, ADRs, lint, typecheck e build são elementos transversais aplicados desde o início; seu uso antecipado não conclui as partes posteriores às quais pertencem. A Parte 4 é a próxima parte principal, mas ainda não foi iniciada. A PWA básica antecipada não altera esse status.

Snapshots de estoque pertencem ao histórico e à rastreabilidade das movimentações já implementadas. Eles não são a Parte 4. A Parte 4 oficial é exclusivamente o bloco das regras 30–35.

## Parte 1 — regras 1–11

**Objetivo real:** estabelecer protocolo de análise, identidade e escopo do StockFlow como produto acadêmico real, título e objetivos do TCC, público-alvo, escopo negativo, stack, política de dependências e princípios arquiteturais.

**Status:** avançada.

**Progresso comprovado:** auditoria inicial, identidade do produto, título e objetivos preliminares, público-alvo, escopo negativo, stack coerente e arquitetura local-first simples estão registrados e implementados no recorte atual.

**Pendente:** amadurecer a documentação acadêmica e revisar versões/requisitos somente quando necessário, sem ampliar o escopo nem tratar o projeto como Projeto Integrador.

## Parte 2 — regras 12–18

**Objetivo real:** orientar estrutura de diretórios, modelo de domínio, UUIDs, datas, IndexedDB/Dexie, mutações locais atômicas e regras essenciais de negócio.

**Status:** avançada.

**Progresso comprovado:** Product, Category e Movement usam UUID; datas seguem estratégia consistente; Dexie está na versão 9; valores monetários usam centavos; soft delete, snapshots, histórico e transação atômica de entrada/saída estão cobertos por testes.

**Pendente:** entidades de usuário/estabelecimento/sincronização pertencem à evolução futura. As validações defensivas de nome e estoque mínimo no `productService` foram consolidadas sem alterar o schema.

## Parte 3 — regras 19–29

**Objetivo real:** consolidar repositories e services, experiência e layouts responsivos, design system, acessibilidade, páginas, busca, filtros, ordenação, dashboard e alertas com regras centralizadas.

**Status:** concluída.

**Progresso comprovado:** fluxo `UI → Service → Repository → Dexie`, domínio puro, páginas principais, layouts desktop/mobile, componentes reutilizáveis, busca e filtros combináveis, ordenação, dashboard com dados reais, alertas e distinção textual/visual entre estoque normal, baixo e zerado. As validações defensivas no `productService`, a troca de consulta no `useDexieQuery` e a apresentação de low-stock/out-of-stock foram consolidadas e cobertas por testes.

**Pendências conhecidas neste recorte:** nenhuma. Pendências transversais ou de partes posteriores permanecem registradas em seus próprios blocos.

## Parte 4 — regras 30–35

**Objetivo real:** consolidar funcionamento offline-first, detecção de conectividade, PWA, atualização segura da PWA, persistência do IndexedDB e backup/exportação.

**Status:** não iniciada como implementação principal; é a próxima parte da sequência após o encerramento da Parte 3.

**Funcionalidades antecipadas já comprovadas:** operações locais usam IndexedDB; existem manifesto, service worker, cache básico, registro da PWA e indicador baseado em `navigator.onLine`. Esses elementos preservam progresso real, mas não significam que a Parte 4 tenha sido iniciada formalmente.

**Pendente:** restringir e testar cache, distinguir navegador online de backend disponível, corrigir promessa de sincronização inexistente, implementar UX segura de atualização, avaliar StorageManager, documentar riscos de persistência e implementar exportação/backup progressivamente.

## Parte 5 — regras 36–42

**Objetivo real:** implementar autenticação, comportamento de sessão offline, Supabase, PostgreSQL, colunas de sincronização, estratégia de `updated_at` e Row Level Security.

**Status:** não iniciada.

**Preparação existente:** UUIDs, timestamps, soft delete e `syncStatus` facilitam a evolução, mas não constituem Auth, Supabase, PostgreSQL ou RLS.

**Pendente:** toda a camada remota, credenciais reais, migrations, isolamento por estabelecimento, sessão e políticas RLS.

## Parte 6 — regras 43–54

**Objetivo real:** implementar sincronização real com outbox local, estados, push, retry, pull, exclusões, conflitos, concorrência de estoque, operação atômica remota e UX de sincronização/conflitos.

**Status:** não iniciada.

**Preparação existente:** entidades locais possuem `syncStatus` e o stub `syncPendingData()` consulta parte das pendências. Isso não é sincronização funcional.

**Pendente:** outbox persistente e atômica, engine de push/pull, confirmação, cursor, backoff, conflitos, concorrência, função PostgreSQL e central de sincronização.

## Parte 7 — regras 55–69

**Objetivo real:** consolidar hooks e reatividade, estratégia de estado, formulários, moeda, confirmações, feedback, erros, loading/empty states, responsividade, performance, segurança e privacidade.

**Status:** avançada.

**Progresso comprovado:** hooks de consulta/conectividade, `liveQuery`, formulários validados, moeda centralizada, proteção contra duplo envio, feedback, estados reutilizáveis e layouts responsivos.

**Pendente:** completar acessibilidade, Error Boundary, taxonomia de erros, revisão responsiva sistemática, `SECURITY.md` e requisitos futuros de segurança/privacidade. O `useDexieQuery` já recria a assinatura quando dependências explícitas mudam.

## Parte 8 — regras 70–79

**Objetivo real:** estruturar testes unitários, de banco, componentes e E2E, coverage, scripts, typecheck, ESLint, formatação e `.gitignore`.

**Status:** avançada.

**Progresso comprovado:** Vitest, fake-indexeddb, React Testing Library, scripts de lint/typecheck/test/build e 18 arquivos com 166 testes aprovados na validação de 15/07/2026, incluindo o caminho de migration v1 → v9.

**Pendente:** Playwright/E2E, testes offline/PWA, coverage, lacunas de componentes, decisão sobre Prettier e revisão dos scripts/documentação sem alterar dependências fora de etapa autorizada.

## Parte 9 — regras 80–86

**Objetivo real:** organizar CI no GitHub, templates, política de commits e branches, releases, roadmap e README.

**Status:** iniciada.

**Progresso comprovado:** branch `develop`, scripts de qualidade, roadmap oficial consolidado e README alinhado ao estado funcional, à arquitetura, às migrations, às limitações e às 15 partes.

**Pendente:** GitHub Actions, templates, documentação formal do fluxo e releases baseadas em critérios reais. O roadmap de milestones citado dentro do Prompt Mestre não substitui as 15 partes oficiais.

## Parte 10 — regras 87–98

**Objetivo real:** produzir documentação acadêmica, requisitos, histórias, casos de uso, rastreabilidade, diagramas, ADRs e instrumentos/planos de pesquisa, usabilidade e testes.

**Status:** iniciada.

**Progresso comprovado:** Prompt Mestre, documentos de continuidade e cinco ADRs; tema, problema e objetivos preliminares estão registrados.

**Pendente:** requisitos formais, histórias, casos de uso, matriz, diagramas coerentes, documentação acadêmica completa e instrumentos de pesquisa/usabilidade sem inventar resultados.

## Parte 11 — regras 99–106

**Objetivo real:** disciplinar dados de demonstração, configuração e experiência de desenvolvimento, VS Code, dívida técnica, transparência de erros, comandos destrutivos e fluxo incremental de implementação.

**Status:** avançada.

**Progresso comprovado:** npm/lockfile, comandos de qualidade, registro de dívidas e protocolo de raiz/branch/worktree e de execução incremental estão documentados.

**Pendente:** revisar `.env.example` e dados demo quando a camada remota for autorizada; manter dívida técnica rastreável e nunca mascarar resultados.

## Parte 12 — regras 107–118

**Objetivo real:** definir as fases internas de execução, da auditoria à validação acadêmica, incluindo fundação, produtos, movimentações, dashboard, estabilização do núcleo do TCC, PWA/offline, nuvem, sincronização, conflitos, testes e pesquisa.

**Status:** avançada no núcleo local; fases futuras não iniciadas.

**Progresso comprovado:** auditoria, fundação, produtos/categorias, movimentações e parte de dashboard/alertas foram implementados; existe PWA básica antecipada.

**Pendente:** iniciar a Parte 4 somente em etapa futura explicitamente autorizada. Auth/nuvem, sincronização, conflitos, E2E/CI e validação acadêmica permanecem futuros.

## Parte 13 — regras 119–128

**Objetivo real:** aplicar critérios de aceite e definição de pronto, registrar saídas verificáveis, priorizar integridade e simplicidade, documentar decisões, manter nomenclatura/textos claros e logs seguros.

**Status:** avançada como prática transversal.

**Progresso comprovado:** integridade local, testes, lint, typecheck e build são usados como critérios; arquitetura e ADRs privilegiam simplicidade e clareza.

**Pendente:** manter os critérios por etapa, completar acessibilidade/erros/logs quando aplicável e não declarar prontas funcionalidades futuras.

## Parte 14 — regras 129–138

**Objetivo real:** tratar auditoria, versionamento de schemas, migrations Supabase, seed, build e documentação de arquitetura offline/sincronização, além de trabalhos futuros e checklist técnico final.

**Status:** iniciada.

**Progresso comprovado:** histórico de movimentações, Dexie versionado até v9, migrations locais testadas, build usado na validação e arquitetura local documentada.

**Pendente:** audit log administrativo somente se necessário, migrations/seed Supabase quando autorizados, documentação e diagramas da sincronização real e checklist final do TCC.

## Parte 15 — regras 139–143

**Objetivo real:** impor auditoria inicial, continuidade incremental, explicabilidade, independência de IA e tratamento do StockFlow como produto acadêmico real e base do TCC.

**Status:** em aplicação contínua.

**Progresso comprovado:** raiz e estado são verificados antes das etapas; decisões, limitações e continuidade são documentadas; trabalho existente e histórico são preservados.

**Pendente:** manter essas regras em todas as próximas etapas e tratar o StockFlow exclusivamente como TCC, salvo decisão futura explícita do responsável.

## Próximo passo oficial

Revisar e consolidar esta etapa de fechamento pós-auditoria. Depois de commit e autorização explícita para uma nova etapa, planejar o início da Parte 4 pelas regras 30–35. Esta atualização documental não inicia a Parte 4.
