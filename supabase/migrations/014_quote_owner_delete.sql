-- 014: Restrict quote deletion to the tenant OWNER only.
--
-- Previously "quotes: creator or owner delete" let any creator delete their own
-- quote. Deletion is now an owner-only housekeeping action (and the app further
-- limits it to draft/declined quotes + an explicit 30s "arm" gate). Child rows
-- (scenarios, line items, signers, signature sessions) still cascade on delete.

drop policy if exists "quotes: creator or owner delete" on public.quotes;

create policy "quotes: owner delete"
  on public.quotes for delete
  using (
    tenant_id = public.current_tenant_id()
    and public.is_tenant_owner()
  );
