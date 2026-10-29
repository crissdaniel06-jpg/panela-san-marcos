begin;

alter table public.orders alter column id set default gen_random_uuid();

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_status%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
  for c in
    select conname from pg_constraint
    where conrelid = 'public.transfer_receipts'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%review_status%'
  loop
    execute format('alter table public.transfer_receipts drop constraint %I', c.conname);
  end loop;
end $$;

update public.orders
set payment_status = 'PENDIENTE_VERIFICACION', updated_at = now()
where payment_status = 'APROBACION_SIMULADA';
update public.transfer_receipts
set review_status = 'EN_REVISION'
where review_status = 'APROBACION_SIMULADA';

alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('PENDIENTE','COMPROBANTE_RECIBIDO','PENDIENTE_VERIFICACION','VERIFICADO','RECHAZADO','REQUIERE_CORRECCION'));
alter table public.transfer_receipts add constraint transfer_receipts_review_status_check
  check (review_status in ('RECIBIDO','EN_REVISION','APROBADO','RECHAZADO','REQUIERE_CORRECCION'));
alter table public.transfer_receipts add column if not exists reviewed_by uuid references auth.users(id);
alter table public.transfer_receipts add column if not exists review_note text;

create or replace function public.mark_receipt_received()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.orders
  set payment_status = 'PENDIENTE_VERIFICACION', updated_at = now()
  where id = new.order_id and user_id = new.user_id;
  return new;
end;
$$;

create or replace function public.review_transfer_receipt(p_receipt_id uuid, p_decision text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_order uuid;
  v_payment_status text;
begin
  if v_user is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_decision is null or p_decision not in ('APROBADO','RECHAZADO','REQUIERE_CORRECCION') then
    raise exception 'INVALID_REVIEW_DECISION';
  end if;
  v_payment_status := case p_decision when 'APROBADO' then 'VERIFICADO' when 'RECHAZADO' then 'RECHAZADO' else 'REQUIERE_CORRECCION' end;
  update public.transfer_receipts
  set review_status = p_decision, reviewed_at = now(), reviewed_by = v_user, review_note = nullif(trim(p_note),'')
  where id = p_receipt_id and review_status in ('RECIBIDO','EN_REVISION')
  returning order_id into v_order;
  if not found then return false; end if;
  update public.orders
  set payment_status = v_payment_status, updated_at = now()
  where id = v_order and payment_method = 'Transferencia bancaria';
  return true;
end;
$$;
revoke all on function public.review_transfer_receipt(uuid,text,text) from public, anon;
grant execute on function public.review_transfer_receipt(uuid,text,text) to authenticated;

drop policy if exists receipt_owner_delete_orphan on storage.objects;
create policy receipt_owner_delete_orphan on storage.objects for delete to authenticated
using (
  bucket_id = 'transfer-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and not exists (select 1 from public.transfer_receipts r where r.storage_path = name)
);

create or replace function public.create_order(
  p_items jsonb, p_city text, p_payment_method text, p_customer jsonb, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_order uuid;
  v_subtotal numeric(10,2) := 0;
  v_shipping numeric(10,2);
  v_line record;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_request_id::text, 0));
  select id into v_order from public.orders where user_id = v_user and request_id = p_request_id;
  if found then return v_order; end if;

  if p_city not in ('Pacto','Quito','Cumbayá','Tumbaco') or p_city is null then raise exception 'INVALID_CITY'; end if;
  if p_payment_method not in ('Transferencia bancaria','Pago contra entrega') or p_payment_method is null then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_customer is null or jsonb_typeof(p_customer) <> 'object'
     or nullif(trim(p_customer->>'firstName'),'') is null
     or nullif(trim(p_customer->>'lastName'),'') is null
     or coalesce(p_customer->>'email','') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or nullif(trim(p_customer->>'phone'),'') is null
     or length(trim(coalesce(p_customer->>'address',''))) < 5 then
    raise exception 'INVALID_CUSTOMER_DATA';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'EMPTY_CART'; end if;

  v_shipping := case p_city when 'Pacto' then 1.50 when 'Quito' then 2.50 else 3.00 end;
  for v_line in
    select (x->>'id')::integer as product_id, sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as x group by 1 order by 1
  loop
    if v_line.product_id is null or v_line.quantity is null or v_line.quantity not between 1 and 100 then
      raise exception 'INVALID_QUANTITY';
    end if;
    perform 1 from public.products
      where id = v_line.product_id and available and stock >= v_line.quantity for update;
    if not found then raise exception 'UNAVAILABLE_PRODUCT'; end if;
    select v_subtotal + price * v_line.quantity into v_subtotal
      from public.products where id = v_line.product_id;
  end loop;

  insert into public.orders(
    id,user_id,request_id,subtotal,shipping,total,payment_method,
    customer_first_name,customer_last_name,customer_email,customer_phone,delivery_address,delivery_city
  ) values (
    gen_random_uuid(),v_user,p_request_id,v_subtotal,v_shipping,v_subtotal+v_shipping,p_payment_method,
    trim(p_customer->>'firstName'),trim(p_customer->>'lastName'),trim(p_customer->>'email'),
    trim(p_customer->>'phone'),trim(p_customer->>'address'),p_city
  ) returning id into v_order;

  for v_line in
    select (x->>'id')::integer as product_id, sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as x group by 1 order by 1
  loop
    insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_subtotal)
    select v_order,id,name,price,v_line.quantity,price*v_line.quantity
    from public.products where id = v_line.product_id;
    update public.products set stock = stock - v_line.quantity, updated_at = now()
    where id = v_line.product_id;
  end loop;
  return v_order;
end;
$$;

revoke all on function public.create_order(jsonb,text,text,jsonb,uuid) from public, anon;
grant execute on function public.create_order(jsonb,text,text,jsonb,uuid) to authenticated;

commit;
