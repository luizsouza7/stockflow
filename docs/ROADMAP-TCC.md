# Roadmap TCC — StockFlow

> Consolidado em 17/07/2026. O StockFlow é o TCC real. O planejamento oficial é o `docs/prompt/PROMPT-MESTRE-STOCKFLOW.md`, dividido nas 15 partes abaixo pelos intervalos de regras definidos pelo responsável pelo projeto.

## Como interpretar o roadmap

- **não iniciada:** não há implementação comprovada;
- **iniciada:** existe preparação ou um subconjunto do objetivo;
- **avançada:** parte substancial existe, mas permanecem critérios relevantes;
- **praticamente concluída:** o núcleo existe e restam correções delimitadas;
- **concluída:** o objetivo delimitado foi comprovado, sem pendência conhecida que impeça o encerramento.

Não são usados percentuais. As “fases” das regras 107–118 e os milestones citados no Prompt Mestre são conteúdo da Parte 12 e não substituem esta sequência oficial.

## Sequência principal e elementos transversais

As **Partes 3 e 4 estão concluídas** no escopo implementado. Testes, documentação, ADRs, lint, typecheck e build são elementos transversais aplicados desde o início; seu uso antecipado não conclui as partes posteriores às quais pertencem.

Snapshots de estoque pertencem ao histórico e à rastreabilidade das movimentações já implementadas. Eles não são a Parte 4. A Parte 4 oficial é exclusivamente o bloco das regras 30–35.

## Parte 1 — regras 1–11

**Objetivo real:** estabelecer protocolo de análise, identidade e escopo do StockFlow como produto acadêmico real, título e objetivos do TCC, público-alvo, escopo negativo, stack, política de dependências e princípios arquiteturais.

**Status:** avançada.

**Progresso comprovado:** auditoria inicial, identidade do produto, título e objetivos preliminares, público-alvo, escopo negativo, stack coerente e arquitetura local-first simples estão registrados e implementados no recorte atual.

**Pendente:** amadurecer a documentação acadêmica e revisar versões/requisitos somente quando necessário, sem ampliar o escopo nem tratar o projeto como Projeto Integrador.

## Parte 2 — regras 12–18

**Objetivo real:** orientar estrutura de diretórios, modelo de domínio, UUIDs, datas, IndexedDB/Dexie, mutações locais atômicas e regras essenciais de negócio.

**Status:** avançada.

**Progresso comprovado:** Product, Category e Movement usam UUID; datas seguem estratégia consistente; Dexie está na versão 10; valores monetários usam centavos; soft delete, snapshots, histórico e transação atômica de entrada/saída estão cobertos por testes.

**Pendente:** entidades de usuário/estabelecimento/sincronização pertencem à evolução futura. As validações defensivas de nome e estoque mínimo no `productService` foram consolidadas sem alterar o schema.

## Parte 3 — regras 19–29

**Objetivo real:** consolidar repositories e services, experiência e layouts responsivos, design system, acessibilidade, páginas, busca, filtros, ordenação, dashboard e alertas com regras centralizadas.

**Status:** concluída.

**Progresso comprovado:** fluxo `UI → Service → Repository → Dexie`, domínio puro, páginas principais, layouts desktop/mobile, componentes reutilizáveis, busca e filtros combináveis, ordenação, dashboard com dados reais, alertas e distinção textual/visual entre estoque normal, baixo e zerado. As validações defensivas no `productService`, a troca de consulta no `useDexieQuery` e a apresentação de low-stock/out-of-stock foram consolidadas e cobertas por testes.

**Pendências conhecidas neste recorte:** nenhuma. Pendências transversais ou de partes posteriores permanecem registradas em seus próprios blocos.

## Parte 4 — regras 30–35

**Objetivo real:** consolidar funcionamento offline-first, detecção de conectividade, PWA, atualização segura da PWA, persistência do IndexedDB e backup/exportação.

**Status:** concluída; regras 30–35 implementadas.

**Progresso comprovado:** operações locais continuam usando IndexedDB; o estado inicial e os eventos de conectividade possuem testes e cleanup; a mensagem offline não promete sincronização; o service worker distingue navegações e caminhos estáticos conhecidos de APIs, rotas privadas, recursos externos e métodos mutáveis; o build injeta identificador determinístico e isola caches por versão; caches antigos do StockFlow são removidos por prefixo somente na ativação; o registro ocorre somente em produção; uma nova versão aguardando pode ser aplicada por ação do usuário com reload único controlado; o lifecycle do IndexedDB trata `versionchange`, upgrade bloqueado, cleanup e aviso entre abas sem compartilhar dados de domínio; e a página Dados exporta backup JSON versionado e CSVs de produtos/movimentações, offline, sem modificar o banco ou enviar dados para servidor. O primeiro reload offline e o ciclo real de atualização A → B com preservação do IndexedDB foram validados manualmente.

**Pendente neste recorte:** nenhuma. Importação/restauração não integra a entrega segura atual e permanece futura; a coordenação de múltiplas abas deve ser novamente validada em navegador com o upgrade legítimo v10 da outbox.

## Parte 5 — regras 36–42

**Objetivo real:** implementar autenticação, comportamento de sessão offline, Supabase, PostgreSQL, colunas de sincronização, estratégia de `updated_at` e Row Level Security.

**Status:** concluída e validada operacionalmente em projeto Supabase real de teste.

**Progresso comprovado:** cliente Supabase opcional via env pública, cadastro/login/logout, sessão inicial, listener com cleanup, funcionamento local sem login e página Conta carregada sob demanda. Migration versionada prepara perfis, estabelecimentos, memberships, categorias, produtos e movimentações com `business_id`, trigger de `updated_at`, índices, RLS e policies baseadas em `auth.uid()`.

**Validação operacional:** migrations aplicadas, Auth exercitado, business/membership confirmados e RLS utilizada no fluxo real. A evidência sanitizada está em `docs/VALIDACAO-SUPABASE-6D.md`.

## Parte 6 — regras 43–54

**Objetivo real:** implementar sincronização real com outbox local, estados, push, retry, pull, exclusões, conflitos, concorrência de estoque, operação atômica remota e UX de sincronização/conflitos.

**Status:** em andamento. 6A, 6B, 6C e 6E estão concluídas em código/testes; as validações operacionais 6D e 6F foram concluídas, sendo a 6F encerrada com ressalva visual. Existe push parcial/manual, não sincronização bidirecional.

**Progresso da fatia 6A:** a v10 adiciona outbox persistente; categorias, produtos e movimentações geram eventos pending na mesma transação das mutações locais; contratos incluem estados, idempotência e campos de retry futuro; a UI mostra a quantidade local sem prometer nuvem. Isso não é sincronização funcional.

**Progresso da fatia 6B:** o processador local, chamado apenas de forma explícita com executor injetado, faz claim transacional de `pending` e `error` vencido, usa ordem `createdAt`/`id`, lote limitado, transição para `processing`, remoção após sucesso do executor, falha com erro sanitizado e backoff de 1/5/15/30/60 minutos, além de reset manual de `processing` travado. O indicador distingue fila, processamento, erro e conflito previsto sem prometer nuvem.

**Progresso da fatia 6C:** a Conta permite carregar/validar business, selecionar contexto, associar eventos antigos sem envio e disparar push manual. Categorias/produtos usam RPCs com RLS, ledger idempotente e `version`; updates de produto preservam `current_quantity`. Movimentos, eventos sem contexto e updates sem versão-base não são enviados. Não há gatilhos automáticos.

**Validação da fatia 6D:** as migrations das Partes 5 e 6C foram aplicadas em Supabase real de teste; login, business/membership, seleção de estabelecimento, associação sem envio, push manual de categorias/produtos, `sync_operations` e bloqueio de `movement.created` foram confirmados operacionalmente.

**Progresso da fatia 6E:** uma migration nova amplia `sync_operations` para movimentos e cria `register_stock_movement` como `SECURITY INVOKER`. A RPC valida Auth/membership/business/produto, usa lock de linha, impede estoque negativo, compara snapshots, insere o movimento e atualiza saldo/versão atomicamente. O gateway libera somente movimentos rastreados válidos; legado e falhas permanecem em erro/backoff. O disparo continua exclusivamente manual.

**Validação da fatia 6F:** a migration 6E e a RPC foram validadas em Supabase real com entrada e saída, gravação em `stock_movements`, atualização de `products.current_quantity`, incremento de versão, registro em `sync_operations` e recusa de snapshot divergente. O botão permaneceu em “Enviando...” até recarregar a página, ressalva visual que não impediu a aplicação remota.

**Pendente:** corrigir a ressalva visual, executar cenários multi-dispositivo amplos, implementar pull/cursor, retry automático, conflitos reais e central de conflitos.

**Relatório técnico:** a evolução incremental, a arquitetura, as validações e os limites das etapas 6A–6F estão consolidados em `docs/RELATORIO-TECNICO-PARTE-6-SINCRONIZACAO.md`. A Parte 6 permanece em andamento.

## Parte 7 — regras 55–69

**Objetivo real:** consolidar hooks e reatividade, estratégia de estado, formulários, moeda, confirmações, feedback, erros, loading/empty states, responsividade, performance, segurança e privacidade.

**Status:** avançada.

**Progresso comprovado:** hooks de consulta/conectividade, `liveQuery`, formulários validados, moeda centralizada, proteção contra duplo envio, feedback, estados reutilizáveis e layouts responsivos.

**Pendente:** completar acessibilidade, Error Boundary, taxonomia de erros, revisão responsiva sistemática, `SECURITY.md` e requisitos futuros de segurança/privacidade. O `useDexieQuery` já recria a assinatura quando dependências explícitas mudam.

## Parte 8 — regras 70–79

**Objetivo real:** estruturar testes unitários, de banco, componentes e E2E, coverage, scripts, typecheck, ESLint, formatação e `.gitignore`.

**Status:** avançada.

**Progresso comprovado:** Vitest, fake-indexeddb, React Testing Library, scripts de lint/typecheck/test/build e 44 arquivos com 439 testes aprovados na validação de 20/07/2026, incluindo os caminhos de migration v1 → v10 e v9 → v10 e as garantias de outbox, processamento/retry, push manual, RPC atômica de estoque, contexto, mapeamento, SQL/RLS/idempotência, ausência de automatismo, conectividade, PWA, lifecycle, backup e Auth.

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

**Pendente:** dados demo somente se forem necessários em etapa autorizada; manter dívida técnica rastreável e nunca mascarar resultados.

## Parte 12 — regras 107–118

**Objetivo real:** definir as fases internas de execução, da auditoria à validação acadêmica, incluindo fundação, produtos, movimentações, dashboard, estabilização do núcleo do TCC, PWA/offline, nuvem, sincronização, conflitos, testes e pesquisa.

**Status:** avançada no núcleo local; fases futuras não iniciadas.

**Progresso comprovado:** auditoria, fundação, produtos/categorias, movimentações e parte de dashboard/alertas foram implementados; existe PWA básica antecipada.

**Pendente:** pull, movimentações remotas, conflitos, E2E/CI e validação acadêmica complementar permanecem futuros.

## Parte 13 — regras 119–128

**Objetivo real:** aplicar critérios de aceite e definição de pronto, registrar saídas verificáveis, priorizar integridade e simplicidade, documentar decisões, manter nomenclatura/textos claros e logs seguros.

**Status:** avançada como prática transversal.

**Progresso comprovado:** integridade local, testes, lint, typecheck e build são usados como critérios; arquitetura e ADRs privilegiam simplicidade e clareza.

**Pendente:** manter os critérios por etapa, completar acessibilidade/erros/logs quando aplicável e não declarar prontas funcionalidades futuras.

## Parte 14 — regras 129–138

**Objetivo real:** tratar auditoria, versionamento de schemas, migrations Supabase, seed, build e documentação de arquitetura offline/sincronização, além de trabalhos futuros e checklist técnico final.

**Status:** iniciada.

**Progresso comprovado:** histórico de movimentações, Dexie versionado até v10, migrations locais testadas, build usado na validação e arquitetura local documentada.

**Pendente:** audit log administrativo somente se necessário, seed se autorizado, documentação e diagramas das próximas etapas de sincronização e checklist final do TCC.

## Parte 15 — regras 139–143

**Objetivo real:** impor auditoria inicial, continuidade incremental, explicabilidade, independência de IA e tratamento do StockFlow como produto acadêmico real e base do TCC.

**Status:** em aplicação contínua.

**Progresso comprovado:** raiz e estado são verificados antes das etapas; decisões, limitações e continuidade são documentadas; trabalho existente e histórico são preservados.

**Pendente:** manter essas regras em todas as próximas etapas e tratar o StockFlow exclusivamente como TCC, salvo decisão futura explícita do responsável.

## Próximo passo oficial

Preservar os registros das validações 6D e 6F. O próximo passo seguro é corrigir o loading visual do envio manual e, depois, planejar a 6G — pull remoto com cursor seguro. Conflitos reais e central de conflitos exigem etapas posteriores separadas.
