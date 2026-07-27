# Validação Supabase — leitura remota paginada

Status: **checklist pendente; a migration da Parte 6I-A não foi aplicada**.

Use projeto e estabelecimento descartáveis. Não registre tokens, chaves, senhas, project refs,
UUIDs reais ou conteúdo comercial.

## Preparação

- [ ] Confirmar migrations anteriores alinhadas local/remoto.
- [ ] Revisar `20260726215950_part6i_remote_inventory_read_page.sql`.
- [ ] Confirmar no dry-run somente essa migration.
- [ ] Aplicar apenas após revisão humana separada.
- [ ] Confirmar Dexie v12 e ausência de store nova.

## Catálogo e privilégios

- [ ] Confirmar assinatura `public.get_business_inventory_page(uuid, jsonb, integer)`.
- [ ] Confirmar owner `postgres`, `SECURITY INVOKER` e `search_path` vazio.
- [ ] Confirmar `EXECUTE` somente para `authenticated`.
- [ ] Confirmar ausência de privilégio para `PUBLIC`, `anon` e `service_role`.
- [ ] Confirmar ausência de função privada nova exposta e de escrita em tabelas.

## Auth, isolamento e limites

- [ ] Sem sessão: `AUTHENTICATION_REQUIRED`.
- [ ] Sem membership ativa: `ACTIVE_MEMBERSHIP_REQUIRED`.
- [ ] Business excluído/inexistente: `BUSINESS_NOT_FOUND`.
- [ ] Confirmar isolamento integral entre businesses.
- [ ] Página 1 e 200 aceitas; 0 e 201 recusadas; padrão limitado a 50.
- [ ] Cursor acima de 4 KiB recusado.
- [ ] Cursor malformado, versão desconhecida e business divergente recusados.
- [ ] Confirmar timestamps/UUIDs/inteiros inválidos sempre como `INVALID_CURSOR`/`22023`.
- [ ] Confirmar `infinity` e `-infinity` recusados sem mensagem nativa do PostgreSQL.
- [ ] Confirmar timestamp não finito nas projeções como
      `INVALID_REMOTE_INVENTORY_TIMESTAMP`, sem omissão silenciosa.

## Paginação e payload

- [ ] Confirmar watermark idêntico em todas as páginas.
- [ ] Sem itens, confirmar watermark igual ao horário capturado do servidor.
- [ ] Com maior `sortTime` finito anterior ao servidor, confirmar uso do horário do servidor.
- [ ] Com categoria, produto ou soft delete finito futuro, confirmar watermark elevado e item
      visível na primeira página.
- [ ] Confirmar validação cruzada de cada página contra o cursor efetivamente enviado.
- [ ] Repetir ou retroceder a última chave da página anterior e confirmar rejeição.
- [ ] Confirmar `nextCursor` derivado do último item retornado.
- [ ] Confirmar página final com `hasMore = false` e cursor nulo.
- [ ] Empatar timestamps entre tipos e UUIDs; confirmar ranks e ausência de perda/repetição.
- [ ] Confirmar categorias/produtos do bootstrap sem `sync_operations`.
- [ ] Confirmar movimento posterior e ausência de movimento histórico não enviado.
- [ ] Confirmar soft deletes das três entidades.
- [ ] Confirmar versões, timestamps, relações, preço em centavos e saldos.
- [ ] Confirmar snapshots, `isLegacy`, nota e data do movimento.
- [ ] Confirmar aritmética dos snapshots de entrada/saída e proteção contra overflow.
- [ ] Confirmar `sortTime = max(createdAt, updatedAt, deletedAt quando presente)`.
- [ ] Simular `Failed to fetch`, `AbortError`, timeout e connection reset em `result.error`;
      confirmar classificação como falha de rede.
- [ ] Confirmar página pequena e página com exatamente 5 MiB.
- [ ] Confirmar `REMOTE_PAGE_TOO_LARGE` com 5 MiB + 1 byte.
- [ ] Confirmar `pageSize = 1` recusado quando nota, código ou nome bruto tornam o JSON gigante.
- [ ] Confirmar ausência de truncagem; repetir com `pageSize` menor quando aplicável.
- [ ] Na UI, selecionar 10, 25, 50, 100 e 200 itens; confirmar padrão 50 e valor efetivamente
      enviado e retornado.
- [ ] Após `REMOTE_PAGE_TOO_LARGE` na primeira página, reduzir a quantidade e repetir a primeira
      chamada sem persistir `pageSize`.
- [ ] Após `REMOTE_PAGE_TOO_LARGE` na próxima página, confirmar que página e cursor atuais são
      preservados; reduzir somente `pageSize` e repetir com o mesmo cursor.
- [ ] Confirmar que nomes com espaços externos ou conteúdo longo são resumidos somente na
      apresentação, sem mutar o payload ou copiar o valor bruto para atributos DOM.

## Ausência de efeitos locais

- [ ] Fotografar categories, products, movements, outbox e initialCloudLoads antes/depois.
- [ ] Confirmar mesmos registros, `syncStatus`, contexto ativo e metadado de backup.
- [ ] Confirmar ausência de evento novo, evento marcado `synced` ou cursor persistido.
- [ ] Recarregar a página e confirmar desaparecimento da sessão de paginação.
- [ ] Confirmar que o manual pull continua bloqueado.

## Consistência e encerramento

- [ ] Registrar que chamadas HTTP distintas não formam snapshot transacional.
- [ ] Registrar que inserts/updates tardios continuam uma limitação da inspeção.
- [ ] Alterar uma linha concorrentemente e documentar sem aplicar dados.
- [ ] Confirmar que a inspeção não é apresentada como sincronização completa.
- [ ] Registrar data, ambiente, contagens sanitizadas e resultado.
- [ ] Não habilitar aplicação local, cursor incremental, reconciliação ou automação.
