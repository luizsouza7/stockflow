# StockFlow

StockFlow e um sistema web responsivo para controle de estoque de pequenos comercios.

Este repositorio contem o **TCC real StockFlow**, desenvolvido de forma incremental a partir de um nucleo local/offline. Por decisao atual do responsavel, o projeto nao deve ser tratado ou planejado como Projeto Integrador.

## Contexto academico

- Projeto: StockFlow
- Contexto: Trabalho de Conclusao de Curso (TCC)
- Estado funcional: nucleo local/offline em evolucao
- Planejamento oficial: `docs/prompt/PROMPT-MESTRE-STOCKFLOW.md`

## Objetivo do sistema

Desenvolver um sistema web simples, responsivo e utilizavel em computador e celular para apoiar o controle de estoque de pequenos comercios. Nesta etapa, o foco esta no funcionamento local/offline, sem backend e sem login.

## Publico-alvo

O sistema e voltado para pequenos comercios que precisam controlar produtos, entradas, saidas e alertas de estoque baixo, mas que ainda dependem de controles manuais, planilhas ou anotacoes dispersas.

## Problema que o sistema busca resolver

Pequenos negocios podem perder vendas, comprar produtos em excesso ou deixar itens acabarem por falta de um controle de estoque simples e acessivel. O StockFlow busca reduzir esse problema oferecendo um controle local, rapido e responsivo, com historico de movimentacoes e alertas de reposicao.

## Escopo funcional documentado

Esta versao implementa:

- Cadastro de produtos
- Edicao e exclusao logica de produtos, preservando o historico
- Busca de produtos por nome ou codigo
- Registro de entrada e saida de estoque
- Validacao para impedir saida maior que a quantidade disponivel
- Atualizacao automatica da quantidade em estoque
- Historico de movimentacoes
- Alertas de produtos abaixo ou no estoque minimo
- Dashboard com indicadores principais
- Funcionamento local/offline usando IndexedDB
- Indicador visual de status online/offline
- Interface responsiva para desktop e celular
- PWA basica com service worker

## Funcionalidades implementadas

- Dashboard com total de produtos, produtos com estoque baixo, total de movimentacoes e ultimas movimentacoes
- CRUD de produtos com campos de nome, codigo, categoria, preco, quantidade atual e estoque minimo
- Movimentacoes de entrada e saida vinculadas aos produtos
- Historico salvo localmente no navegador
- Pagina de alertas para produtos que precisam de reposicao
- Persistencia local com Dexie.js e IndexedDB
- Arquitetura preparada para futura sincronizacao com a nuvem

## Tecnologias utilizadas

- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Dexie.js
- IndexedDB
- PWA basica com service worker

## Estrutura principal

```text
src/
  components/
  hooks/
  pages/
  services/
    db/
    sync/
  types/
```

## Como instalar e rodar

```bash
npm install
npm run dev
```

Depois acesse a URL exibida pelo Vite no terminal.

## Funcionamento offline

Os dados sao armazenados no navegador usando IndexedDB. Depois do primeiro carregamento, o service worker permite que a aplicacao continue abrindo em modo offline, e o sistema exibe uma mensagem quando a conexao esta indisponivel.

## Sincronizacao futura

A pasta `src/services/sync` contem a funcao `syncPendingData()`. Ela e apenas uma preparacao: busca registros com `syncStatus: "pending"` no IndexedDB e simula o ponto de entrada da sincronizacao. Nao existe conexao real com Supabase, backend ou servico em nuvem nesta versao.

## Evolucao planejada do TCC

- Login e autenticacao
- Integracao com Supabase
- Sincronizacao real com a nuvem
- Tratamento de conflitos de sincronizacao
- Relatorios de estoque e movimentacoes
- Testes com usuarios reais
- Avaliacao de usabilidade
- PWA mais completa, com estrategias avancadas de cache e instalacao

## Fora do escopo atual

- Backend
- Login
- Supabase implementado
- Nota fiscal
- Financeiro
- Multiusuario
- Inteligencia artificial

## Observacoes

- Os dados ficam salvos no navegador/dispositivo usado.
- Para testar offline em desenvolvimento, carregue o app uma vez e depois use as ferramentas do navegador para simular offline.
- Este README recebeu apenas a correcao obrigatoria de contexto academico. Uma etapa documental posterior deve atualiza-lo integralmente conforme o estado real do TCC.
