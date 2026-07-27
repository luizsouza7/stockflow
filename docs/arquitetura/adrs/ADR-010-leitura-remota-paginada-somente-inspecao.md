# ADR-010 — Leitura remota paginada somente para inspeção

## Status

Aceita em 26 de julho de 2026. A migration permanece local e ainda requer validação operacional.

## Contexto

A carga inicial e o push manual já produzem projeções autoritativas em `public.categories`,
`public.products` e `public.stock_movements`. Antes de projetar aplicação no IndexedDB, cursor
incremental, reconciliação ou conflitos, é necessário inspecionar essas projeções sem alterar o
estado local.

`public.sync_operations` não pode ser a fonte do inventário: o bootstrap não cria operações
normais para categorias e produtos, enquanto soft deletes e movimentos posteriores pertencem às
projeções atuais.

## Decisão

A RPC `public.get_business_inventory_page(uuid, jsonb, integer)` lê diretamente as três projeções
sob RLS e devolve `items`, `nextCursor`, `hasMore`, `watermark`, `pageSize` e `returnedCount`.
Usa `SECURITY INVOKER`, owner `postgres`, `search_path = ''`, `auth.uid()`, membership ativa e
business não excluído. `EXECUTE` é exclusivo de `authenticated`, com revogação de `PUBLIC`,
`anon` e `service_role`.

A função não usa SQL dinâmico e não contém `INSERT`, `UPDATE`, `DELETE` ou `UPSERT`. Não consulta
ledger privado e não escreve em qualquer tabela.

## Cursor de página e watermark

O cursor é JSON validado integralmente pelo servidor:

```json
{
  "version": 1,
  "businessId": "uuid",
  "watermark": "timestamptz",
  "after": {
    "sortTime": "timestamptz",
    "entityRank": 1,
    "entityId": "uuid"
  }
}
```

Ele é apenas a posição da próxima página na sessão em memória. Não é cursor incremental,
checkpoint, confirmação de aplicação local nem estado persistente de pull. Cursor adulterado não
concede acesso; valores inválidos geram erro seguro. Como bootstrap e creates preservam timestamps
recebidos do dispositivo, o relógio do banco isoladamente não cobre necessariamente todos os
registros já visíveis. Na primeira chamada, a mesma consulta que materializa os itens captura
`server_now`, encontra o maior `sortTime` finito visível e define o watermark como o maior desses
dois valores. Sem itens, usa `server_now`. As páginas seguintes reutilizam o mesmo instante e
selecionam chaves estritamente maiores que `after`. O cursor é limitado a 4 KiB. A página aceita
1–200 itens, com padrão 50.

Todas as seis conversões SQL do cursor ficam em um bloco de exceção pequeno e dedicado; qualquer
falha de timestamp, UUID ou inteiro é sanitizada como `INVALID_CURSOR`/`22023`. No cliente, a
página é validada também contra o cursor enviado: watermark idêntico e todos os itens
estritamente posteriores à chave `after`.

## Ordenação, sortTime e soft deletes

A chave global é `sortTime`, rank fixo (`category = 1`, `product = 2`, `movement = 3`) e UUID.
Para as três entidades:

```sql
greatest(created_at, updated_at, coalesce(deleted_at, '-infinity'))
```

Todos os campos existem no schema. Nos movimentos, esses timestamps representam o estado
autoritativo da linha; `movement_date` permanece no payload como data do domínio. Nenhum filtro
remove `deleted_at`, portanto soft deletes continuam visíveis. Rank e UUID impedem perda em
empates.

## Payload e cliente

O envelope contém tipo, IDs, versão, `sortTime`, `deletedAt` e `data`. Categorias preservam nome e
timestamps. Produtos preservam código, categoria, preço em centavos inteiros, saldos, estoque
mínimo e timestamps. Movimentos preservam tipo, quantidade, nota, `movementDate`, snapshots,
`isLegacy` e timestamps. Bigints fora do intervalo seguro do JavaScript são rejeitados, nunca
convertidos silenciosamente.

Movimentos rastreados também têm os snapshots validados aritmeticamente conforme entrada ou
saída, incluindo estoque não negativo e proteção contra overflow. `sortTime` precisa ser o máximo
exato entre `createdAt`, `updatedAt` e `deletedAt` presente.

O gateway valida sessão e resposta e classifica erros de autenticação, membership, business,
cursor, página, rede e resposta. O service reconfirma sessão, business selecionado e membership
antes da chamada e descarta resultado se usuário ou business mudar durante a requisição.
Falhas de transporte devolvidas pelo PostgREST, como `Failed to fetch`, `AbortError`, timeout e
connection reset, são classificadas como rede mesmo quando chegam em `result.error`.

Qualquer `created_at`, `updated_at` ou `deleted_at` não finito nas três projeções bloqueia a
inspeção com erro sanitizado; a linha nunca é ocultada pelo watermark. O JSON completo de uma
página é limitado a 5 MiB em bytes, inclusive para `pageSize = 1`. Não há truncagem de nome,
código ou observação: o usuário pode tentar novamente com uma quantidade menor.

A UI mantém somente a página atual, mostra índice e permite apenas avanço. O usuário seleciona
10, 25, 50, 100 ou 200 itens por página, com padrão 50, e pode repetir uma chamada recusada por
tamanho excessivo usando uma quantidade menor. Se a próxima página exceder 5 MiB, a página atual
e seu cursor permanecem disponíveis para que somente o `pageSize` seja reduzido no retry.

Nomes de categorias e produtos são aparados, têm espaços internos normalizados e são resumidos
em até 120 caracteres somente durante a apresentação. O payload remoto validado não é modificado,
e o texto bruto não é copiado para atributos DOM auxiliares. Reiniciar, trocar usuário/business
ou recarregar elimina cursor, watermark e itens. Não existe botão de aplicar, importar, mesclar
ou substituir. Nenhuma camada importa Dexie, repositories de escrita ou outbox. O schema local
permanece v12, sem store ou migration local nova. A migration remota permanece não aplicada.

## Limitação de consistência

O watermark limita a janela ao maior limite superior finito observado na primeira consulta, mas
chamadas HTTP distintas não constituem snapshot transacional PostgreSQL. Inserts ou updates
tardios ainda podem aparecer, mudar de posição ou ficar fora da janela conforme seu `sortTime`.
Por isso o resultado é somente inspeção: não é aplicado localmente, não avança cursor persistente
e não representa sincronização completa.

## Consequências

Bootstrap, movimentos posteriores e soft deletes podem ser inspecionados com payload limitado e
isolamento por business. O pull funcional continua bloqueado. Uma etapa futura deverá definir
consistência, cursor incremental persistente, aplicação transacional, reconciliação, conflitos e
recuperação antes de habilitar pull ou automação.
