begin;

-- Funções de trigger não precisam ser executáveis diretamente por roles cliente.
revoke execute
on function private.add_business_owner_membership()
from public;

revoke execute
on function private.set_updated_at()
from public;

-- Impede que futuras funções criadas por postgres no schema private
-- recebam EXECUTE público automaticamente.
alter default privileges for role postgres
in schema private
revoke execute on functions from public;

commit;