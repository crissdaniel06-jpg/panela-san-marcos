-- Restore the transfer payment path after the bank account details were verified.
-- Keep the current create_order implementation and remove only the explicit
-- TRANSFER_UNAVAILABLE guard introduced by the previous disable migration.
do $migration$
declare
  v_definition text;
  v_disabled_guard text := '  if p_payment_method = ''Transferencia bancaria'' then raise exception ''TRANSFER_UNAVAILABLE''; end if;';
begin
  select pg_get_functiondef('public.create_order(jsonb, text, text, jsonb, uuid)'::regprocedure)
    into v_definition;

  if position(v_disabled_guard in v_definition) = 0 then
    raise exception 'Expected transfer payment guard was not found in public.create_order';
  end if;

  execute replace(v_definition, v_disabled_guard, '');
end;
$migration$;

comment on table public.payments is
  'Payment ledger separated from orders. Transfer orders begin pending and require manual receipt verification.';
