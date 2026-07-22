# Validação operacional Supabase — Etapa 6F

## 1. Objetivo

Esta etapa teve como objetivo validar, em ambiente Supabase real de teste, a RPC atômica de movimentações implementada na etapa 6E. A validação concentrou-se no envio manual de `movement.created`, na gravação em `stock_movements`, na atualização atômica de `products.current_quantity`, no incremento de versão, no registro de idempotência em `sync_operations` e na recusa de uma movimentação cujo snapshot divergia do estado remoto.

## 2. Escopo validado

- aplicação da migration 6E no Supabase real de teste;
- RPC `public.register_stock_movement`;
- saída de estoque;
- entrada de estoque;
- atualização do estoque remoto;
- registro remoto das movimentações;
- registro em `sync_operations`;
- idempotência operacional por meio do ledger remoto;
- recusa de divergência de snapshot;
- manutenção do push exclusivamente manual;
- ausência de pull e de sincronização automática.

## 3. Escopo não validado nesta etapa

Não foram implementados nem validados nesta etapa:

- pull remoto;
- sincronização bidirecional completa;
- central de conflitos;
- resolução real de conflitos;
- múltiplos dispositivos concorrentes em teste prático amplo;
- sincronização automática;
- interface final de resolução de divergências.

## 4. Ambiente utilizado

A validação utilizou a aplicação local em ambiente de desenvolvimento e um projeto Supabase real de teste. As migrations das etapas 5, 6C e 6E já estavam aplicadas. O arquivo `.env.local` foi utilizado somente no ambiente local e seu conteúdo não integra este registro.

Por segurança, este documento não registra URL real, anon key, project ref completo, token, senha, UUID completo, idempotency key real ou qualquer outro segredo. Quando necessário, as referências são representadas pelos placeholders `<business-id>`, `<product-id>`, `<movement-id>`, `<idempotency-key>` e `<payload-hash>`.

## 5. Validação da saída de estoque

O produto de teste, identificado conceitualmente como `Produto RPC Estoque`, iniciou no banco remoto com `current_quantity = 10`. Uma saída de quantidade 3 foi enviada manualmente.

A tabela `stock_movements` registrou:

- `movement_type = saida`;
- `quantity = 3`;
- `previous_quantity = 10`;
- `resulting_quantity = 7`.

Após a operação, `products.current_quantity` passou para 7, conforme esperado.

## 6. Validação da entrada de estoque

Em seguida, uma entrada de quantidade 5 foi enviada manualmente para o mesmo produto.

A tabela `stock_movements` registrou:

- `movement_type = entrada`;
- `quantity = 5`;
- `previous_quantity = 7`;
- `resulting_quantity = 12`.

Após a operação, `products.current_quantity` passou para 12. A coluna `products.version` chegou a 3 no produto testado, confirmando os incrementos de versão observados durante o fluxo.

## 7. Validação de sync_operations

A tabela `sync_operations` continha as colunas:

- `business_id`;
- `idempotency_key`;
- `entity_type`;
- `entity_id`;
- `operation`;
- `payload_hash`;
- `applied_version`;
- `created_at`.

Foram observadas operações `category.created`, `product.created` e `movement.created`. Para `movement.created`, foi confirmado o registro de:

- `entity_type = movement`;
- `operation = movement.created`;
- `idempotency_key` preenchida;
- `payload_hash` preenchido;
- `applied_version` preenchido.

Os valores reais completos não são reproduzidos neste documento.

## 8. Validação de divergência de snapshot

O cenário negativo utilizou o produto conceitual `Produto Divergência 6E`. Seu estoque remoto foi mantido em `current_quantity = 2`. A consulta em `stock_movements` para esse produto não retornou linhas após a tentativa incompatível.

Isso confirma que a RPC não gravou a movimentação com snapshot divergente e que o estoque remoto não foi sobrescrito silenciosamente. O resultado comprova a proteção operacional contra divergência de snapshot, mas não representa uma implementação de resolução de conflitos.

## 9. Validação de bloqueios de segurança

- o push continua manual;
- não há push automático;
- não há pull;
- não há sincronização automática;
- não há sincronização pelo Service Worker;
- login e estado online não disparam envio;
- movimentações são enviadas somente pela RPC;
- o frontend não atualiza `current_quantity` remoto diretamente.

## 10. Problemas encontrados e ressalvas

Durante o envio, foi observado um comportamento visual no qual o botão permaneceu em “Enviando...” até a página ser recarregada. A consulta ao Supabase confirmou que a operação havia sido aplicada corretamente.

Esse comportamento foi classificado como bug visual/estado de UI, e não como falha da RPC. Recomenda-se corrigir o estado de loading antes de avançar para o pull remoto. A etapa 6F foi considerada operacionalmente concluída com essa ressalva visual; o bug não foi corrigido nesta tarefa documental.

## 11. Evidências textuais seguras

```text
stock_movements:
movement_type = saida
quantity = 3
previous_quantity = 10
resulting_quantity = 7

stock_movements:
movement_type = entrada
quantity = 5
previous_quantity = 7
resulting_quantity = 12

products:
name = Produto RPC Estoque
current_quantity = 12
version = 3

Produto Divergência 6E:
current_quantity = 2
stock_movements: no rows returned

sync_operations:
entity_type = movement
operation = movement.created
idempotency_key preenchida
payload_hash preenchido
applied_version preenchido
```

## 12. Conclusão

A etapa 6F confirmou que a RPC atômica de movimentações funciona em ambiente Supabase real para registrar entradas e saídas de estoque, atualizar o saldo remoto, incrementar versão e registrar idempotência.

A validação foi concluída com uma ressalva visual: o botão de envio manual pode permanecer em “Enviando...” até recarregar a página, apesar de a operação remota ser aplicada corretamente.

A Parte 6 ainda não está concluída integralmente, pois pull remoto, resolução real de conflitos, central de conflitos e sincronização automática permanecem pendentes.
