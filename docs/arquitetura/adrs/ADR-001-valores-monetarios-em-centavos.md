# ADR-006 — Valores monetários em centavos

- Status: aceita
- Data: 12/07/2026
- Schema local: versão 3

## Contexto

O schema inicial persistia o preço de venda no campo `price` como número decimal. Números JavaScript usam ponto flutuante e não são uma fonte de verdade adequada para dinheiro porque algumas frações decimais não possuem representação binária exata.

## Decisão

O preço de venda passa a ser armazenado exclusivamente no campo `salePriceInCents`, como inteiro não negativo. Por exemplo, `R$ 19,90` é persistido como `1990`.

A interface aceita `19,90` e `19.90`. A conversão e a apresentação ficam centralizadas em:

- `parseCurrencyToCents`;
- `formatCentsToBRL`;
- `formatCentsForInput`.

O formulário mantém o valor digitado como texto e só o converte ao salvar. Ao editar, os centavos são convertidos novamente para texto decimal. Assim, abrir e salvar `1990` centavos não produz `199000`.

## Migração

A versão 3 do Dexie percorre os produtos criados nas versões 1 e 2. Para cada registro:

1. valida o campo decimal antigo `price`;
2. calcula `Math.round(price * 100)`;
3. grava `salePriceInCents`;
4. remove o campo antigo `price`.

A operação acontece no upgrade transacional do Dexie. Nome, código, categoria, estoque, datas, `deletedAt`, `syncStatus` e movimentações não são modificados. Um valor antigo inválido interrompe a migração, evitando converter silenciosamente dados corrompidos.

## Consequências

- cálculos e persistência monetária usam inteiros;
- a interface continua usando o formato brasileiro;
- apenas preço de venda foi incluído, pois preço de custo ainda não pertence ao escopo atual;
- a entrada aceita no máximo duas casas decimais e não interpreta separadores de milhar;
- os valores ficam limitados ao intervalo de inteiros seguros do JavaScript.
