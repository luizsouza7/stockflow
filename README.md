# StockFlow

StockFlow é um sistema web responsivo para controle de estoque de pequenos comércios. Este repositório contém o Trabalho de Conclusão de Curso (TCC) real, desenvolvido de forma incremental com uma base local e offline-first.

O sistema busca substituir controles manuais e planilhas dispersas por um fluxo simples de cadastro, movimentação, histórico e alertas. O público-alvo são pequenos comércios que precisam acompanhar o estoque pelo computador ou celular, inclusive quando a conexão está indisponível.

## Estado atual

- Parte 3 do Prompt Mestre concluída.
- Parte 4 (regras 30–35) concluída no escopo local.
- Núcleo local funcional, persistido em IndexedDB pelo Dexie.
- Schema Dexie atual: **versão 10**, com outbox local persistente.
- Parte 5 concluída no escopo de Auth opcional e SQL PostgreSQL/RLS preparado.
- Parte 6 avançou pelas fatias 6A, 6B e 6C: outbox, processamento local e push remoto manual/controlado de categorias e produtos; pull e movimentações remotas não existem.
- Suíte atual: **406 testes em 43 arquivos**.
- Planejamento oficial: [Prompt Mestre](docs/prompt/PROMPT-MESTRE-STOCKFLOW.md), dividido em 15 partes.

## Funcionalidades implementadas

- dashboard alimentado por dados locais reais, com estoque baixo e sem estoque separados;
- produtos com cadastro, edição, busca, filtros, ordenação e exclusão lógica;
- categorias como entidades, associação opcional e exclusão lógica protegida;
- UUIDs para produtos, categorias e movimentações;
- código interno opcional, sanitizado e único entre produtos ativos;
- preços armazenados em centavos inteiros;
- saldo inicial definido na criação e estoque protegido contra edição direta;
- entradas e saídas em transação atômica, com bloqueio de saída maior que o saldo;
- snapshots `previousQuantity` e `resultingQuantity` nas novas movimentações;
- preservação explícita de movimentações legadas sem snapshots inventados;
- histórico com filtros por produto, tipo e período;
- alertas e estados textuais distintos para estoque normal, baixo e zerado;
- estados de carregamento, erro, vazio e sucesso nas consultas principais;
- funcionamento local com IndexedDB, consultas reativas e interface responsiva.
- lifecycle do IndexedDB com fechamento em `versionchange`, aviso de upgrade bloqueado e coordenação básica entre abas.

## Arquitetura

```text
UI → Service → Repository → Dexie/IndexedDB
        ↓
      Domain (regras puras)
```

A UI não acessa o Dexie diretamente. Services validam e coordenam casos de uso; repositories encapsulam a persistência; `domain` concentra regras puras quando apropriado. O `stockMovementService` delimita a transação atômica que atualiza o produto e registra a movimentação.

Detalhes estão em [Arquitetura Atual](docs/ARQUITETURA-ATUAL.md) e nos ADRs de `docs/arquitetura/adrs/`.

## Stack

- React 18, React Router e TypeScript;
- Vite e Tailwind CSS;
- Dexie sobre IndexedDB;
- Vitest, fake-indexeddb, React Testing Library e jsdom;
- ESLint.

## Offline-first e PWA

Produtos, categorias e movimentações são lidos e gravados localmente, sem depender de backend. A PWA registra o service worker somente em produção, prepara o app shell e oferece atualização consciente quando uma nova versão fica aguardando. O build gera um identificador determinístico a partir dos artefatos produzidos, injeta-o no worker e isola cada versão em `stockflow-static-<build-id>`. Somente caminhos conhecidos (`/assets/...`, manifest e ícone) entram no cache estático; futuras APIs, rotas privadas, recursos externos e métodos mutáveis ficam fora.

O indicador usa `navigator.onLine` e eventos nativos `online`/`offline`; ele informa a conectividade percebida pelo navegador, não comprova acesso completo à internet nem disponibilidade de servidor. Sem conexão, a interface comunica somente que os dados continuam armazenados no dispositivo, sem prometer sincronização. O lifecycle do banco fecha conexões antigas diante de `versionchange`, apresenta mensagens compreensíveis e usa `BroadcastChannel` apenas para eventos de upgrade bloqueado, sem transmitir dados de negócio. Em `pagehide`, listeners, canal e conexão são encerrados; um retorno legítimo pelo BFCache reinstala um único monitor e reabre explicitamente o Dexie. Cada abertura assíncrona pertence a uma geração: `pagehide`, `dispose` ou estado terminal tornam a tentativa obsoleta, e uma abertura obsoleta que conclua é fechada novamente. Estados `reload-required` são terminais e nunca mantêm a conexão reaberta.

## Backup e exportação local

A página **Dados** gera, sem rede, um backup JSON explícito com identificador `stockflow-backup`, versão de formato `1`, data de exportação, schema Dexie `10` como metadado e coleções separadas de categorias, produtos e movimentações. A outbox não integra o arquivo de backup de domínio. A leitura ocorre em uma transação somente leitura das três tabelas de domínio e inclui soft deletes e histórico, preservando UUIDs, relações, centavos e a distinção entre movimentos rastreados e legados.

Também é possível exportar produtos e movimentações em CSV. Os arquivos são baixados localmente e não alteram o banco nem são enviados a servidor. Não há importação/restauração, backup automático ou recuperação em nuvem; a importação permanece futura até existir estratégia rigorosamente validada e segura.

## Conta, Supabase e preparação PostgreSQL

A rota **Conta** é carregada sob demanda e usa o cliente oficial Supabase quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão configuradas. Ela oferece cadastro, login, restauração/escuta da sessão e logout local, com mensagens amigáveis e cleanup do listener. Sem configuração ou sem login, o núcleo local permanece disponível. Copie `.env.example` para `.env.local`; nunca use chave `service_role`, senha do banco ou segredo administrativo em variáveis `VITE_*`.

A migration versionada em `supabase/migrations` prepara perfis, estabelecimentos, memberships, categorias, produtos e movimentações. As tabelas de negócio usam `business_id`, RLS e policies baseadas em membership ativa e `auth.uid()`. O SQL não é executado pelo frontend e ainda precisa ser aplicado e validado em um projeto Supabase real.

## Processamento local da outbox — Parte 6B

O processador local recebe um executor injetado e não é chamado pela UI, pelo boot, pelo login nem por eventos de conectividade. Em uma transação Dexie, ele seleciona `pending` e `error` cujo `nextAttemptAt` venceu, ordena por `createdAt` e `id`, limita o lote a 25 itens por padrão (máximo de 100) e marca o lote como `processing` antes do executor. O claim transacional impede que duas execuções concorrentes obtenham o mesmo evento; `updatedAt` também atua como token simples para não finalizar um claim que já tenha sido recuperado.

Sucesso de executor local/testável remove o evento. O executor remoto da 6C solicita arquivamento como `synced` e guarda somente `remoteVersion`, necessária para updates otimistas posteriores. Falhas viram `error`, incrementam `attemptCount`, guardam `lastError` sanitizado e calculam `nextAttemptAt` em 1, 5, 15, 30 e, depois, no máximo 60 minutos. Não há retry automático; uma função manual permite recolocar `processing` antigo em `pending` após interrupção. `conflict` está previsto no contrato e no indicador, mas não é processado nem resolvido.

## Push remoto manual — Parte 6C

A página **Conta** oferece um fluxo deliberadamente separado: carregar estabelecimentos permitidos pela RLS, validar e selecionar um contexto, associar eventos device-scoped ainda sem contexto e, em outra ação, enviar alterações compatíveis. A seleção armazena localmente apenas o `businessId` em chave isolada pelo UUID do usuário. Associar pendências atualiza somente `userId`/`businessId` e metadados da outbox, em transação, sem enviar ou alterar entidades de negócio.

O push exige Supabase configurado, sessão reconfirmada no clique, usuário correspondente, conexão indicada como online, membership ativa e evento vinculado ao mesmo usuário/estabelecimento. Categorias e produtos usam RPCs PostgreSQL específicas, um ledger remoto por `business_id + idempotency_key`, RLS e `version` otimista. Updates de produto não escrevem `current_quantity`; somente `product.created` envia o saldo inicial. `movement.created` é mantido com erro/backoff amigável e nenhuma chamada remota, pois ainda depende de RPC atômica de estoque.

O envio só ocorre pelo botão **Enviar alterações compatíveis**. Não há chamada no boot, login, `onAuthStateChange`, evento online/offline, timer ou Service Worker. Não há pull, reconciliação, resolução de conflitos ou sincronização completa. As migrations precisam ser aplicadas e validadas em um projeto Supabase real antes do uso fora de mocks/testes.

## Limitações atuais

- Auth e o push dependem de configuração, aplicação das migrations e validação em um projeto Supabase real;
- o push é parcial e manual: suporta categorias/produtos vinculados; não há pull, envio de movimentações, retry automático ou resolução de conflitos;
- eventos antigos sem `businessId` nunca são enviados automaticamente, e updates sem versão remota segura permanecem em erro;
- não há importação/restauração, backup automático ou backup em nuvem;
- não há testes E2E nem automação de navegador para instalação/offline da PWA, coverage configurada ou CI;
- os dados permanecem no navegador e no dispositivo utilizados.

Persistência remota de categorias/produtos está preparada pelo fluxo manual controlado; sincronização bidirecional e estoque remoto continuam futuros.

## Estrutura resumida

```text
src/
  components/    componentes compartilhados e layout
  domain/        regras puras
  hooks/         consultas reativas e conectividade
  pages/         telas e formulários
  repositories/ acesso às tabelas locais
  services/      casos de uso, banco e preparação de sync
  types/         entidades e DTOs
docs/            estado, arquitetura, roadmap, Prompt Mestre e ADRs
public/          manifesto, ícone, service worker e política de cache
```

## Instalação e execução

Requer Node.js e npm compatíveis com as dependências registradas no lockfile.

```bash
npm install
npm run dev
```

Abra a URL informada pelo Vite. Os dados de desenvolvimento são armazenados no IndexedDB do navegador.

## Scripts

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | inicia o servidor de desenvolvimento |
| `npm run build` | executa o build TypeScript e Vite |
| `npm run lint` | verifica o código com ESLint |
| `npm run typecheck` | verifica os tipos sem emitir arquivos |
| `npm run test` | executa a suíte uma vez |
| `npm run test:watch` | executa testes em modo interativo |
| `npm run preview` | serve localmente o build gerado |

## Testes

A suíte usa Vitest. Testes de persistência e migrations usam fake-indexeddb; componentes e hooks usam React Testing Library com jsdom. Há cobertura de domínio, services, repositories, formulários, consultas reativas, transações, snapshots, UUIDs, outbox, upgrades do banco e lifecycle entre conexões, incluindo o caminho histórico completo v1 → v10.

Estado validado nesta etapa: **406 testes aprovados em 43 arquivos**.

## Banco local e migrations

O banco padrão é `stockflow-local-db`. O schema final v10 contém `products`, `categories`, `movements` e `outbox`.

| Versão | Evolução principal |
| --- | --- |
| v1 | produtos e movimentações com IDs numéricos |
| v2 | soft delete de produtos |
| v3 | preço decimal migrado para centavos |
| v4 | movimentações antigas explicitadas como legadas |
| v5 | categorias convertidas em entidades |
| v6–v9 | migração segura dos IDs e relações para UUID e limpeza das stores temporárias |

As migrations preservam dados históricos e relações. O teste permanente v1 → v10 comprova preço em centavos, quantidade, categoria, movimentação legada, UUIDs e relação entre produto e movimentação; o upgrade v9 → v10 preserva as três tabelas existentes e inicia a outbox vazia.

## Decisões arquiteturais

Os ADRs atuais registram:

1. valores monetários em centavos;
2. snapshots de estoque nas movimentações;
3. separação entre domínio, services e repositories;
4. categorias como entidades;
5. UUIDs para produtos e movimentações.

## Roadmap oficial

O Prompt Mestre possui 143 regras distribuídas oficialmente assim:

| Parte | Regras | Síntese |
| --- | --- | --- |
| 1 | 1–11 | identidade, escopo, stack e princípios |
| 2 | 12–18 | estrutura, domínio, persistência e regras essenciais |
| 3 | 19–29 | services, UI, páginas, consultas, dashboard e alertas |
| 4 | 30–35 | offline-first, conectividade, PWA, persistência e backup/exportação |
| 5 | 36–42 | autenticação, Supabase, PostgreSQL e RLS |
| 6 | 43–54 | sincronização, outbox, conflitos e concorrência |
| 7 | 55–69 | hooks, formulários, UX, erros, performance e segurança |
| 8 | 70–79 | estratégia e automação de testes |
| 9 | 80–86 | CI, Git, releases, roadmap e README |
| 10 | 87–98 | documentação acadêmica, requisitos e pesquisa |
| 11 | 99–106 | dados de demonstração, DX e disciplina de evolução |
| 12 | 107–118 | fases internas de execução |
| 13 | 119–128 | critérios de aceite, qualidade e clareza |
| 14 | 129–138 | auditoria, schemas, migrations e checklist final |
| 15 | 139–143 | continuidade, explicabilidade e independência de IA |

A Parte 3 permanece concluída. A Parte 4 está concluída com as regras 30–35 implementadas no escopo local. A Parte 5 está concluída no escopo de código e SQL, embora a aplicação/validação em projeto Supabase real continue operacionalmente necessária. A Parte 6 avançou pelas fatias 6A, 6B e 6C: outbox transacional, processamento/retry local e push manual protegido para categorias/produtos. Pull, movimentos remotos, conflitos reais, sincronização automática e concorrência remota continuam futuros.

Consulte [Roadmap TCC](docs/ROADMAP-TCC.md), [Estado Atual](docs/ESTADO-ATUAL-DO-PROJETO.md) e [Como Continuar](docs/COMO-CONTINUAR-O-DESENVOLVIMENTO.md) antes de evoluir o projeto.

## Status acadêmico

Projeto acadêmico em desenvolvimento como TCC. Não há licença de distribuição definida neste repositório.
