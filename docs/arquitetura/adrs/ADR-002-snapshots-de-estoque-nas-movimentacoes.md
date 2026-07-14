# ADR-002 — Snapshots de estoque nas movimentações

- Status: aceita
- Data: 12/07/2026
- Schema local: versão 4

## Contexto

As movimentações armazenavam produto, tipo e quantidade, mas não registravam o estoque imediatamente anterior e posterior à operação. Isso reduzia a rastreabilidade e dificultaria a investigação de inconsistências e a futura sincronização.

Não é possível reconstruir com segurança os snapshots de todos os registros existentes. O estoque atual pode ter sido alterado por uma sequência desconhecida, e movimentações antigas não carregam informação suficiente para provar os valores intermediários.

## Decisão

Toda nova movimentação deve registrar:

- `previousQuantity`: estoque antes da operação;
- `resultingQuantity`: estoque depois da operação.

Os dois valores são inteiros não negativos. A função `calculateStockSnapshot` centraliza o cálculo e as validações. O produto e a movimentação continuam sendo gravados na mesma transação Dexie.

O tipo `Movement` passa a ser uma união discriminada:

- movimentação rastreável, com ambos os snapshots obrigatórios;
- movimentação legada, com `isLegacy: true` e sem snapshots.

## Migração

A versão 4 do schema preserva todas as movimentações. Registros da versão 3 sem snapshots recebem apenas `isLegacy: true`. Nenhuma quantidade histórica é inventada.

Produtos, preços em centavos, datas, `deletedAt`, `syncStatus` e o conteúdo original das movimentações são preservados. A interface identifica registros legados e informa que os estoques anterior e resultante estão indisponíveis.

## Consequências

- novas movimentações possuem trilha quantitativa verificável;
- uma falha continua provocando rollback completo;
- registros legados permanecem consultáveis, mas sem snapshots;
- a futura sincronização poderá comparar eventos e resultados com mais contexto;
- o marcador legado poderá ser removido somente quando não existirem mais registros antigos ou houver reconstrução comprovadamente determinística.
