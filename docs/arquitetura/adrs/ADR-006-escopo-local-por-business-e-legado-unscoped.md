# ADR-006 — Escopo local por businessId e preservacao do legado unscoped

## Status

Aceito.

## Contexto

O IndexedDB do StockFlow nasceu device-scoped: categorias, produtos e movimentacoes eram compartilhados por toda a instalacao local, sem referencia a estabelecimento. A outbox ganhou `businessId` na Parte 6C, mas sua associacao e uma decisao de envio e nao comprova a propriedade das entidades antigas. Um mesmo registro tambem pode possuir varios eventos historicos com estados e contextos diferentes.

A Parte 6G bloqueou o pull porque importar dados remotos nesse modelo poderia misturar estabelecimentos, sobrescrever pendencias e tornar saldo e historico inconsistentes.

## Decisao

`Category`, `Product` e `Movement` passam a aceitar `businessId?: string`. Quando presente, o valor deve ser um UUID valido. Quando ausente, a entidade e explicitamente unscoped: dado local legado ou ainda nao associado a estabelecimento.

O schema Dexie v11 adiciona o indice `businessId` as stores `categories`, `products` e `movements`. O upgrade nao executa backfill, nao altera registros e preserva a outbox. As APIs atuais da UI continuam criando dados unscoped; criacao scoped existe somente em services internos explicitos.

## Dados legados

Dados v1–v10 permanecem visiveis e utilizaveis no modo local, com `businessId` ausente. O business selecionado na Conta nao altera entidades. A acao 6C “Associar pendencias locais” continua modificando apenas eventos da outbox.

A outbox nao e fonte segura para backfill porque representa operacoes, nao a decisao de pertencimento da entidade. Eventos podem ter sido associados depois da criacao, podem pertencer a tentativas diferentes e podem coexistir com entidades que continuam legitimamente locais.

`businessId` representa o escopo da entidade e do evento. `userId` existe somente na outbox e representa o usuario que vinculou conscientemente o evento para sincronizacao. Uma mutacao scoped pode criar evento com business e sem usuario; a associacao manual posterior adiciona somente `userId`, preserva o business e nunca altera payload ou entidade. Eventos de outro business nao sao elegiveis.

## Invariantes

- Produto scoped aceita somente categoria ativa do mesmo business ou nenhuma categoria.
- Produto unscoped aceita somente categoria unscoped ou nenhuma categoria.
- Movimento herda o escopo do produto dentro da transacao de estoque.
- Formulario de movimento nao informa `businessId`.
- Updates comuns e soft delete preservam o escopo persistido.
- Eventos novos da outbox recebem o escopo do payload na mesma transacao e aguardam vinculo manual de usuario quando scoped.
- Dados e eventos antigos nao recebem escopo automaticamente.

## Consequencias

- Consultas por business usam indices dedicados e nunca incluem registros unscoped.
- Consultas unscoped continuam disponiveis para o runtime local legado.
- Unicidade logica de nome de categoria e codigo de produto passa a ser avaliada por escopo.
- O backup JSON e os CSVs preservam `businessId` quando presente e sua ausencia no legado.
- O caminho v1 → v11 e o upgrade v10 → v11 tornam-se contratos permanentes de migration.

## Limitacoes

A UI ainda nao opera integralmente por business. Nao existe fluxo de associacao das entidades legadas, pull, cursor, aplicacao de dados remotos, resolucao de conflitos ou sincronizacao automatica. Entidades scoped criadas pela API interna formam apenas a fundacao para etapas posteriores.

## Etapa futura

Uma etapa separada devera criar associacao explicita e consciente dos dados unscoped, com escolha do usuario e validacao das relacoes. Somente depois de o runtime local estar isolado por business o pull bloqueado na 6G podera ser reavaliado.
