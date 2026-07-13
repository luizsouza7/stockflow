# ADR-004 — Categorias como entidades

- Status: aceita
- Data: 12/07/2026
- Schema local: versão 5

## Contexto

Produtos armazenavam `category` como texto livre. Isso permitia duplicidades como `Bebidas`, `bebidas` e ` BEBIDAS `, dificultava renomear categorias e não oferecia identidade adequada para futura sincronização.

## Decisão

Categoria passa a ser uma entidade local com:

- `id` UUID gerado no cliente;
- `name`;
- `createdAt` e `updatedAt`;
- `deletedAt` opcional;
- `syncStatus`.

Produto passa a manter apenas `categoryId?: string`. Ausência de associação é representada por `undefined`; “Sem categoria” existe somente como texto de interface.

O nome possui limite de 80 caracteres. A apresentação é preservada após remover espaços externos e reduzir espaços consecutivos. Para unicidade, o nome sanitizado é comparado em minúsculas com locale `pt-BR`, sem remover acentos.

Categorias ativas não podem ter nomes logicamente iguais. Uma categoria excluída não bloqueia a criação posterior do mesmo nome; a nova categoria recebe outro UUID.

## Migração

A versão 5 percorre os produtos da versão 4 na ordem do banco. Para cada texto não vazio:

1. remove espaços externos e consecutivos;
2. normaliza somente para comparação;
3. cria uma categoria para o primeiro nome lógico encontrado;
4. reutiliza o mesmo UUID nas ocorrências equivalentes;
5. grava `categoryId` no produto;
6. remove definitivamente o antigo campo `category`.

O primeiro nome válido encontrado após sanitização é usado como apresentação. Produtos sem texto válido permanecem sem categoria. Produtos excluídos também são migrados, preservando a referência histórica. Produtos, preços em centavos, estoques, datas, soft delete, status e todas as movimentações são mantidos.

## Exclusão

A exclusão é lógica. Ela é bloqueada enquanto houver produto ativo associado, com mensagem indicando a quantidade de produtos. Produtos excluídos não bloqueiam a operação e mantêm sua referência histórica.

## Consequências

- categorias podem ser criadas, renomeadas e excluídas offline;
- produtos novos só podem apontar para categorias ativas existentes;
- listagens resolvem nomes em lote, evitando consultas N+1;
- categorias já possuem UUID e metadados adequados para sincronização futura, embora nenhuma sincronização seja implementada nesta etapa;
- nomes legados maiores que o limite são preservados pela migração para evitar perda; deverão ser reduzidos em uma edição futura.
