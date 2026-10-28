-- Esquema inicial para Supabase. Ejecutar en SQL Editor o Supabase CLI.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '', last_name text not null default '',
  phone text, address text, city text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, first_name, last_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'first_name',''), coalesce(new.raw_user_meta_data->>'last_name',''))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists public.products (
  id integer primary key, name text not null, description text not null, price numeric(10,2) not null check(price >= 0),
  category text not null, presentation text not null, image_path text not null, stock integer not null default 0 check(stock >= 0),
  available boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.products(id,name,description,price,category,presentation,image_path,stock) values
(1,'Panela molida granulada','Panela natural de caña en presentación granulada, práctica para endulzar bebidas y preparar diferentes recetas.',2.50,'panela','500 g','img/productos/panela-molida.png',30),
(2,'Panela en bloque','Panela tradicional elaborada a partir de caña de azúcar, presentada en bloques para conservar su forma y sabor característico.',2.75,'panela','500 g','img/productos/panela-bloque.png',25),
(3,'Panela con canela','Panela granulada combinada con canela, con un aroma y sabor especiado que complementa bebidas calientes y preparaciones.',3.50,'saborizados','500 g','img/productos/panela-canela.png',20),
(4,'Panela con jengibre','Panela combinada con jengibre, una alternativa con un sabor ligeramente picante y aromático.',3.50,'saborizados','500 g','img/productos/panela-jengibre.png',20),
(5,'Miel de caña','Derivado líquido de la caña de azúcar, de textura espesa y sabor dulce, ideal para acompañar diferentes preparaciones.',4.50,'derivados','480 g','img/productos/miel-cana.png',18),
(6,'Melaza de caña','Derivado concentrado de la caña de azúcar, de color oscuro, textura espesa y sabor intenso.',3.75,'derivados','300 g','img/productos/melaza-cana.png',18),
(7,'Dulce de panela','Dulce tradicional de panela en presentación de 20 cubitos, ideal para disfrutar directamente o acompañar bebidas.',3.00,'derivados','20 cubitos','img/productos/dulce-panela.png',25),
(8,'Infusión de panela','Infusión elaborada con panela y frutas, presentada en sobres individuales para preparar fácilmente una bebida caliente.',4.50,'bebidas','25 sobres','img/infusion-panela.png',15)
on conflict(id) do nothing;

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id integer not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(user_id, product_id)
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  request_id uuid not null,
  status text not null default 'PENDIENTE' check(status in ('PENDIENTE','CANCELADO','COMPLETADO')),
  subtotal numeric(10,2) not null check(subtotal >= 0), shipping numeric(10,2) not null check(shipping >= 0), total numeric(10,2) not null check(total = subtotal + shipping),
  payment_method text not null check(payment_method in ('Transferencia bancaria','Pago contra entrega')),
  payment_status text not null default 'PENDIENTE' check(payment_status in ('PENDIENTE','COMPROBANTE_RECIBIDO','APROBACION_SIMULADA','REQUIERE_CORRECCION')),
  customer_first_name text not null, customer_last_name text not null, customer_email text not null, customer_phone text not null,
  delivery_address text not null, delivery_city text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists orders_user_request_unique on public.orders(user_id, request_id);
create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create table if not exists public.order_items (
  id bigint generated always as identity primary key, order_id uuid not null references public.orders(id) on delete cascade,
  product_id integer references public.products(id) on delete set null,
  product_name text not null, unit_price numeric(10,2) not null check(unit_price >= 0), quantity integer not null check(quantity between 1 and 100), line_subtotal numeric(10,2) not null check(line_subtotal = unit_price * quantity)
);
create index if not exists order_items_order_idx on public.order_items(order_id);
create table if not exists public.transfer_receipts (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, storage_path text not null unique,
  review_status text not null default 'RECIBIDO' check(review_status in ('RECIBIDO','REQUIERE_CORRECCION','APROBACION_SIMULADA')),
  uploaded_at timestamptz not null default now(), reviewed_at timestamptz
);
create index if not exists receipts_user_idx on public.transfer_receipts(user_id, uploaded_at desc);
create or replace function public.mark_receipt_received() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set payment_status='COMPROBANTE_RECIBIDO', updated_at=now() where id=new.order_id and user_id=new.user_id;
  return new;
end; $$;
drop trigger if exists receipt_marks_order on public.transfer_receipts;
create trigger receipt_marks_order after insert on public.transfer_receipts for each row execute procedure public.mark_receipt_received();

create or replace function public.create_order(p_items jsonb, p_city text, p_payment_method text, p_customer jsonb, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_order uuid := gen_random_uuid(); v_subtotal numeric(10,2) := 0; v_shipping numeric(10,2); v_line record;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select id into v_order from public.orders where user_id=v_user and request_id=p_request_id;
  if found then return v_order; end if;
  if p_city not in ('Pacto','Quito','Cumbayá','Tumbaco') then raise exception 'INVALID_CITY'; end if;
  if p_payment_method not in ('Transferencia bancaria','Pago contra entrega') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if nullif(trim(p_customer->>'firstName'),'') is null or nullif(trim(p_customer->>'lastName'),'') is null
     or coalesce(p_customer->>'email','') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or nullif(trim(p_customer->>'phone'),'') is null or length(trim(coalesce(p_customer->>'address',''))) < 5 then raise exception 'INVALID_CUSTOMER_DATA'; end if;
  v_shipping := case p_city when 'Pacto' then 1.50 when 'Quito' then 2.50 else 3.00 end;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'EMPTY_CART'; end if;
  for v_line in select (x->>'id')::integer as product_id, sum((x->>'quantity')::integer)::integer as quantity from jsonb_array_elements(p_items) x group by 1 loop
    if v_line.quantity < 1 or v_line.quantity > 100 then raise exception 'INVALID_QUANTITY'; end if;
    perform 1 from public.products where id=v_line.product_id and available and stock >= v_line.quantity for update;
    if not found then raise exception 'UNAVAILABLE_PRODUCT'; end if;
    select v_subtotal + price * v_line.quantity into v_subtotal from public.products where id=v_line.product_id;
  end loop;
  insert into public.orders(id,user_id,request_id,subtotal,shipping,total,payment_method,customer_first_name,customer_last_name,customer_email,customer_phone,delivery_address,delivery_city)
  values(v_order,v_user,p_request_id,v_subtotal,v_shipping,v_subtotal+v_shipping,p_payment_method,
    coalesce(p_customer->>'firstName',''),coalesce(p_customer->>'lastName',''),coalesce(p_customer->>'email',''),coalesce(p_customer->>'phone',''),coalesce(p_customer->>'address',''),p_city);
  for v_line in select (x->>'id')::integer as product_id, sum((x->>'quantity')::integer)::integer as quantity from jsonb_array_elements(p_items) x group by 1 loop
    insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_subtotal)
    select v_order,id,name,price,v_line.quantity,price*v_line.quantity from public.products where id=v_line.product_id;
    update public.products set stock=stock-v_line.quantity, updated_at=now() where id=v_line.product_id;
  end loop;
  return v_order;
end; $$;
revoke all on function public.create_order(jsonb,text,text,jsonb,uuid) from public, anon;
grant execute on function public.create_order(jsonb,text,text,jsonb,uuid) to authenticated;

create or replace function public.cancel_order(p_order_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.orders set status='CANCELADO', updated_at=now() where id=p_order_id and user_id=v_user and status='PENDIENTE';
  get diagnostics v_count = row_count;
  if v_count=0 then return false; end if;
  update public.products p set stock=p.stock+i.quantity, updated_at=now()
  from public.order_items i where i.order_id=p_order_id and i.product_id=p.id;
  return true;
end; $$;
revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.favorites enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.transfer_receipts enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using(id=auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check(id=auth.uid());
create policy "products_public_read" on public.products for select to anon, authenticated using(available);
create policy "favorites_own_select" on public.favorites for select to authenticated using(user_id=auth.uid());
create policy "favorites_own_insert" on public.favorites for insert to authenticated with check(user_id=auth.uid());
create policy "favorites_own_delete" on public.favorites for delete to authenticated using(user_id=auth.uid());
create policy "orders_own_select" on public.orders for select to authenticated using(user_id=auth.uid());
create policy "items_own_select" on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.user_id=auth.uid()));
create policy "receipts_own_select" on public.transfer_receipts for select to authenticated using(user_id=auth.uid());
create policy "receipts_own_insert" on public.transfer_receipts for insert to authenticated with check(user_id=auth.uid() and storage_path like auth.uid()::text || '/' || order_id::text || '/%' and exists(select 1 from public.orders o where o.id=order_id and o.user_id=auth.uid() and o.payment_method='Transferencia bancaria' and o.payment_status='PENDIENTE') and exists(select 1 from storage.objects s where s.bucket_id='transfer-receipts' and s.name=storage_path));
revoke all on public.orders, public.order_items, public.transfer_receipts from anon, authenticated;
grant select on public.orders, public.order_items, public.transfer_receipts to authenticated;
grant insert on public.transfer_receipts to authenticated;
grant select on public.products to anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update on public.profiles to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('transfer-receipts','transfer-receipts',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','application/pdf'];
create policy "receipt_owner_upload" on storage.objects for insert to authenticated
with check(bucket_id='transfer-receipts' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "receipt_owner_read" on storage.objects for select to authenticated
using(bucket_id='transfer-receipts' and (storage.foldername(name))[1]=auth.uid()::text);
