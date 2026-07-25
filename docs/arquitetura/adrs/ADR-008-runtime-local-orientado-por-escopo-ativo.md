# ADR-008 — Runtime local orientado por escopo ativo

## Status

Aceita em 24/07/2026.

## Contexto

Após a 6H-A, categorias, produtos e movimentações podiam ser unscoped ou pertencer a um
`businessId`, mas as telas operacionais ainda consultavam todo o dispositivo e as mutações comuns
criavam dados unscoped. A 6H-B permitiu associar o legado conscientemente, sem tornar o runtime
seguro para alternar entre dados locais e estabelecimentos.

Sem uma regra única de contexto, uma listagem, mutação ou URL direta poderia misturar dados locais,
business A e business B. Consultar Supabase em cada operação contrariaria o offline-first e
transformaria conectividade em requisito para o núcleo local.

## Decisão

O runtime possui exatamente dois modos:

- `local`: lista e altera somente entidades sem `businessId`;
- `business`: exige sessão atual e contexto previamente validado, lista e altera somente o
  `businessId` selecionado e grava `userId`/`businessId` na outbox.

`ActiveDataScope` é a representação explícita. Um provider/hook compõe a sessão restaurada com a
seleção persistida por usuário e expõe escopo, loading, erro, rótulo amigável e token estável.
Ausência de business é representada por `{ kind: "local" }`, nunca por string vazia.

A seleção validada persiste localmente `userId`, UUID e nome amigável, sem token ou senha. Assim, o
último business do usuário pode continuar operando offline. Uma conta diferente não reutiliza a
seleção porque a chave e o conteúdo são vinculados ao usuário atual.

Repositories oferecem consultas explícitas por escopo, incluindo lookups por ID. Services recebem
um contexto de mutação explícito; não leem React, Auth, Supabase nem a seleção persistida. Criação,
update, delete e movimento validam o escopo dentro das transações relevantes. Produto e categoria
compartilham escopo; movimento herda o escopo do produto.

Consultas Dexie usam o token do escopo como dependência. Rotas de edição fazem lookup scoped.
Formulários são invalidados ou resetados quando o token muda, e resultados assíncronos do contexto
anterior não produzem sucesso visual no contexto novo.

O indicador no layout usa nome amigável. `businessId` não é editável em formulários.

O backup JSON e os CSVs permanecem device-wide: incluem unscoped e todos os businesses presentes
no dispositivo. A UI informa esse comportamento para não sugerir um backup limitado ao contexto.

## Ausências deliberadas

A troca de contexto não associa dados, não executa push nem pull e não apaga registros. A
associação do legado permanece manual na Conta. O push permanece manual. Não foram criados carga
inicial remota, cursor, gateway de pull, aplicação local de linhas remotas, conflitos reais, timer,
Background Sync ou sincronização automática. O Service Worker permanece inalterado.

## Consequências

O núcleo operacional pode ser usado offline em modo local ou no último business validado, sem
mistura entre escopos. Novas mutações business já ficam prontas para o push manual, sem etapa de
associação da outbox. Códigos de produto e nomes de categoria são únicos somente dentro do escopo.

APIs antigas device-wide permanecem onde migrations, exportação e testes históricos precisam
delas, mas não são usadas por páginas operacionais. O banco continua na versão 11 e nenhuma
migration foi alterada.

## Limitações e evolução futura

A seleção persistida comprova apenas que a membership foi validada no fluxo anterior; offline não
é possível reconfirmar uma revogação remota. Essa limitação é coerente com “estado previamente
conhecido” e será reavaliada com a sincronização bidirecional.

O isolamento local não implementa carga inicial. Antes de liberar pull, ainda são necessários
cursor confiável, leitura remota, aplicação transacional, reconciliação com pendências e estratégia
real de conflitos. A existência deste ADR não autoriza antecipar essas etapas.
