-- 013: Protect platform-managed tenant fields from tenant edits.
-- Company Name (tenants.name) and Contact Email (tenants.email) are set by the
-- platform admin at invite time and must not be changed by the tenant owner.
-- The owner's RLS update policy allows updating the whole row, so we enforce
-- column protection with a trigger instead.
--
-- Rule: a TENANT user edit (auth.uid() is not null) may not CHANGE name/email.
-- The platform admin edits via the service-role client (no JWT → auth.uid() is
-- null), so those updates pass. Unchanged values pass either way (is distinct
-- from), so the existing Company Settings save that re-sends the same name is
-- unaffected.

create or replace function public.protect_tenant_admin_fields()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null then
    if new.name is distinct from old.name then
      raise exception 'Company name is managed by UltraQuote and cannot be changed here.';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Contact email is managed by UltraQuote and cannot be changed here.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_tenant_admin_fields on public.tenants;
create trigger protect_tenant_admin_fields
  before update on public.tenants
  for each row execute function public.protect_tenant_admin_fields();
