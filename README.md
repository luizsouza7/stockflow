# StockFlow

StockFlow é um sistema web responsivo para controle de estoque de pequenos comércios. Este repositório contém o Trabalho de Conclusão de Curso (TCC) real, desenvolvido de forma incremental com uma base local e offline-first.

O sistema busca substituir controles manuais e planilhas dispersas por um fluxo simples de cadastro, movimentação, histórico e alertas. O público-alvo são pequenos comércios que precisam acompanhar o estoque pelo computador ou celular, inclusive quando a conexão está indisponível.

## Estado atual

- Parte 3 do Prompt Mestre concluída.
- Parte 4 (regras 30–35) concluída no escopo local.
- Núcleo local funcional, persistido em IndexedDB pelo Dexie.
- Schema Dexie atual: **versão 9**.
- Suíte atual: **250 testes em 29 arquivos**.
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

A página **Dados** gera, sem rede, um backup JSON explícito com identificador `stockflow-backup`, versão de formato `1`, data de exportação, schema Dexie `9` como metadado e coleções separadas de categorias, produtos e movimentações. A leitura ocorre em uma transação somente leitura das três tabelas e inclui soft deletes e histórico, preservando UUIDs, relações, centavos e a distinção entre movimentos rastreados e legados.

Também é possível exportar produtos e movimentações em CSV. Os arquivos são baixados localmente e não alteram o banco nem são enviados a servidor. Não há importação/restauração, backup automático ou recuperação em nuvem; a importação permanece futura até existir estratégia rigorosamente validada e segura.

## Limitações atuais

- não há autenticação, Supabase ou banco remoto;
- não há sincronização real, outbox, retry, pull ou resolução de conflitos;
- `syncPendingData()` é somente um ponto de preparação local e não envia dados;
- não há importação/restauração, backup automático ou backup em nuvem;
- não há testes E2E nem automação de navegador para instalação/offline da PWA, coverage configurada ou CI;
- os dados permanecem no navegador e no dispositivo utilizados.

Supabase, autenticação e sincronização pertencem ao planejamento futuro e não devem ser apresentados como funcionalidades prontas.

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

A suíte usa Vitest. Testes de persistência e migrations usam fake-indexeddb; componentes e hooks usam React Testing Library com jsdom. Há cobertura de domínio, services, repositories, formulários, consultas reativas, transações, snapshots, UUIDs, upgrades do banco e lifecycle entre conexões, incluindo o caminho histórico completo v1 → v9.

Estado validado nesta etapa: **250 testes aprovados em 29 arquivos**.

## Banco local e migrations

O banco padrão é `stockflow-local-db`. O schema final v9 contém `products`, `categories` e `movements`.

| Versão | Evolução principal |
| --- | --- |
| v1 | produtos e movimentações com IDs numéricos |
| v2 | soft delete de produtos |
| v3 | preço decimal migrado para centavos |
| v4 | movimentações antigas explicitadas como legadas |
| v5 | categorias convertidas em entidades |
| v6–v9 | migração segura dos IDs e relações para UUID e limpeza das stores temporárias |

As migrations preservam dados históricos e relações. O teste permanente v1 → v9 comprova preço em centavos, quantidade, categoria, movimentação legada, UUIDs e relação entre produto e movimentação.

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

A Parte 3 permanece concluída. A Parte 4 está concluída com as regras 30–35 implementadas no escopo local. A Parte 5 não foi iniciada.

Consulte [Roadmap TCC](docs/ROADMAP-TCC.md), [Estado Atual](docs/ESTADO-ATUAL-DO-PROJETO.md) e [Como Continuar](docs/COMO-CONTINUAR-O-DESENVOLVIMENTO.md) antes de evoluir o projeto.

## Status acadêmico

Projeto acadêmico em desenvolvimento como TCC. Não há licença de distribuição definida neste repositório.
