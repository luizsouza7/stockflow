# Auditoria da Fase 0 — 12/07/2026

## Ambiente e repositório

- Raiz do projeto e do Git: `C:/Users/lufel/Desktop/sistema-controledeestoque`.
- Repositório Git existente, na branch `develop`, acompanhando `origin/develop`.
- Gerenciador: npm 10.9.0, com `package-lock.json` versão 3.
- Runtime auditado: Node.js 22.12.0.
- O worktree já possuía alterações não commitadas no início desta sessão; elas foram preservadas.

## Stack detectada

- React 18 e React DOM 18;
- TypeScript 5.6 em modo estrito;
- Vite 6;
- React Router 6;
- Tailwind CSS 3 e PostCSS;
- Dexie 4 sobre IndexedDB;
- ESLint 9 com regras TypeScript e React Hooks;
- service worker e manifest implementados manualmente.

## Funcionalidades existentes

- dashboard com dados locais e movimentações recentes;
- cadastro, edição, busca e exclusão lógica de produtos;
- entrada e saída em transação Dexie;
- bloqueio de saída superior ao estoque;
- histórico local preservado após exclusão lógica;
- alertas para `quantidade <= estoque mínimo`;
- layout responsivo com sidebar e navegação inferior;
- indicador online/offline;
- armazenamento local reativo com `liveQuery`;
- manifest e service worker básicos.

## Lacunas e riscos

- preços ainda são números de ponto flutuante, não centavos inteiros;
- IDs locais são incrementais e não estão preparados para sincronização;
- movimentações não guardam estoque anterior e resultante;
- categoria ainda é texto no produto, não uma entidade;
- componentes ainda acessam consultas de banco por funções pouco estruturadas;
- regra de estoque baixo está duplicada em páginas;
- não há estados de erro no hook de consultas;
- formulários não bloqueiam duplo envio nem oferecem feedback de sucesso;
- a PWA não possui prompt ou estratégia segura de atualização;
- o cache manual aceita qualquer GET e precisa ser restringido;
- `navigator.onLine` não comprova disponibilidade do backend;
- não há autenticação, isolamento por estabelecimento, Supabase ou RLS;
- não há outbox persistente, push, pull, retry ou conflitos;
- não há Playwright, Prettier ou GitHub Actions;
- a documentação acadêmica ainda não está estruturada conforme o prompt mestre.

## Sincronização

O arquivo `syncService.ts` apenas consulta produtos e movimentações com status pendente. Não envia, recebe ou confirma dados e não deve ser tratado como sincronização funcional.

## Testes

No início da auditoria não havia testes. A primeira evolução adicionou Vitest e `fake-indexeddb`, cobrindo as regras transacionais críticas de estoque e o soft delete. Playwright e testes de componentes continuam pendentes.

## Prontidão

- **Projeto Integrador 2:** parcial. O núcleo demonstrável existe, mas ainda precisa de categorias, filtros, testes ampliados, validação offline/PWA e documentação da entrega.
- **TCC:** inicial. A base local é útil, porém autenticação, nuvem, segurança, sincronização real, conflitos e validação acadêmica ainda não existem.

## Plano incremental priorizado

1. Consolidar regras de domínio e testes do banco local.
2. Migrar valores monetários para centavos e registrar a migração Dexie.
3. Registrar estoque anterior/resultante nas movimentações.
4. Separar repositories/services e centralizar status de estoque.
5. Implementar categorias e filtros necessários ao PI2.
6. Melhorar feedback, erros, loading e acessibilidade.
7. Restringir e testar a estratégia PWA/offline.
8. Completar testes unitários, componentes, E2E e CI.
9. Preparar Supabase, Auth e RLS sem credenciais versionadas.
10. Implementar outbox, push/pull, retry e conflitos incrementalmente.
11. Completar documentação acadêmica e instrumentos de pesquisa.
