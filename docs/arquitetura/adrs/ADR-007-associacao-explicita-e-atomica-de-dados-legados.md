# ADR-007 — Associação explícita e atômica de dados legados

## Status

Aceito.

## Contexto

A v11 passou a representar o escopo local com `businessId?`, preservando registros antigos como unscoped. Vincular apenas entidades isoladas poderia separar produtos de categorias ou movimentos de seus produtos. Também existem eventos históricos da outbox cujo contexto precisa permanecer coerente com as entidades.

## Decisão

A associação é integral: todas as categorias, produtos e movimentações sem `businessId` são destinadas ao mesmo estabelecimento em uma única operação. Associação parcial foi adiada porque exigiria seleção por grafo e regras adicionais de dependência.

O fluxo exige preview somente leitura, sessão atual, conectividade, business selecionado, membership válida e confirmação explícita. O preview informa contagens e bloqueadores e produz uma assinatura do snapshot. A confirmação relê e revalida o estado antes de escrever.

A escrita usa uma única transação Dexie envolvendo `categories`, `products`, `movements` e `outbox`. Relações incompatíveis, referências órfãs, evento `processing` ou evento relacionado pertencente a outro business/usuário abortam toda a operação.

## Outbox

Somente eventos existentes relacionados às entidades associadas são adaptados:

- evento totalmente unscoped recebe `userId` e `businessId`;
- evento já scoped para o destino e sem usuário recebe apenas `userId`;
- evento já correto permanece intacto;
- payload, `idempotencyKey`, operação, status, tentativas e timestamps são preservados.

Nenhum evento é criado, apagado, marcado como sincronizado ou enviado automaticamente.

## Ausência de reconstrução remota

A associação local não representa upload integral. Entidades sem evento continuam sem envio automático. Não são inventados `category.created`, `product.created` ou `movement.created`, pois replay de movimentos históricos poderia reaplicar estoque e corromper o saldo remoto. Uma eventual carga inicial exige estratégia própria.

## Consequências

- IDs, relações, preços, quantidades, snapshots e soft delete são preservados.
- A operação é idempotente e falha integralmente se o estado mudar após a preview.
- Entidades já scoped não são alteradas.
- Não existe desassociação pelo fluxo comum; a UI recomenda backup e exige confirmação consciente.
- Pull, cursor, conflitos e sincronização automática continuam ausentes.

## Limitações e próximo passo

O runtime principal ainda consulta o dataset do dispositivo e não filtra todas as telas pelo business selecionado. O próximo passo é tornar o runtime integralmente scope-aware antes de reavaliar pull e cursor.
