-- Trigger-only SECURITY DEFINER functions must not be callable through PostgREST RPC.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.mark_receipt_received() from public, anon, authenticated;

-- Cover foreign keys identified as unindexed by Supabase database advisors.
create index if not exists favorites_product_id_idx
  on public.favorites(product_id);
create index if not exists order_item_components_component_product_id_idx
  on public.order_item_components(component_product_id);
create index if not exists order_items_product_id_idx
  on public.order_items(product_id);
create index if not exists order_status_history_changed_by_idx
  on public.order_status_history(changed_by);
create index if not exists transfer_receipts_order_id_idx
  on public.transfer_receipts(order_id);
create index if not exists transfer_receipts_reviewed_by_idx
  on public.transfer_receipts(reviewed_by);
