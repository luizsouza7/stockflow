# ADR-005 — Identificadores UUID para produtos e movimentacoes

## Status

Aceito.

## Contexto

O StockFlow e offline-first e cria dados no cliente. IDs numericos autoincrementais do IndexedDB funcionam em um unico banco local, mas podem colidir quando dados originados em dispositivos diferentes forem reunidos futuramente. Category ja utiliza UUID gerado no cliente; Product e Movement ainda dependiam de chaves numericas, e `Movement.productId` preservava essa dependencia.

## Decisao

Product e Movement passam a ter `id: string`, e `Movement.productId` passa a ser `string`. Novas entidades recebem UUID por `generateUuid()`, baseado em `crypto.randomUUID()`, no service antes da persistencia. Category permanece inalterada, inclusive seus UUIDs existentes.

## Migration dos dados locais

A migration parte do schema v5 e constroi, na mesma transacao de upgrade, um mapa `oldProductId -> newProductUuid`. Cada produto numerico e copiado integralmente para uma store temporaria com seu novo UUID. Cada movimentacao recebe outro UUID e resolve `productId` exclusivamente por esse mapa.

O IndexedDB nao permite alterar o `keyPath` de uma object store existente, e o Dexie 4 rejeita a troca de primary key. Por isso, a mudanca e expressa pelas versoes tecnicas 6 a 9, executadas pelo Dexie dentro da mesma transacao nativa de versionamento:

1. v6 valida as referencias e copia produtos e movimentacoes para stores temporarias com UUID;
2. v7 remove as stores antigas de primary key autoincremental;
3. v8 recria `products` e `movements` com primary key `id` nao incremental e restaura os registros;
4. v9 remove as stores temporarias.

Esse encadeamento preserva os nomes publicos das tabelas e evita tentar atualizar uma primary key no lugar. Se qualquer etapa falhar, o upgrade inteiro sofre rollback e o banco permanece na versao anterior.

## Preservacao e integridade

A migration altera somente `Product.id`, `Movement.id` e `Movement.productId`. Permanecem inalterados categorias e `categoryId`, soft delete, valores em centavos, quantidades, estoque minimo, datas, notas, `syncStatus`, snapshots e a classificacao de movimentacoes legadas. Snapshots ausentes nao sao fabricados.

Uma movimentacao cujo `productId` numerico nao exista no conjunto de produtos aborta a migration com erro explicito. Nao e criada associacao, produto ficticio ou estado parcialmente migrado. Produtos excluidos participam normalmente do mapa e continuam sustentando seu historico.

## Consequencias

- Rotas, services, repositories, mapas e seletores passam a tratar IDs como strings.
- Product e Movement persistidos sempre possuem ID obrigatorio.
- Dexie deixa de autoincrementar as duas tabelas.
- A criacao local fica preparada para identidades sem colisao pratica entre dispositivos, sem implementar sincronizacao nesta etapa.
- A migration usa duas stores temporarias apenas durante o upgrade e quatro versoes tecnicas por uma limitacao do IndexedDB/Dexie.

## Limitacoes

UUID nao implementa sincronizacao, autenticacao, resolucao de conflitos ou integridade referencial no servidor. A garantia desta decisao e local e depende da disponibilidade de `crypto.randomUUID()` no ambiente suportado.
