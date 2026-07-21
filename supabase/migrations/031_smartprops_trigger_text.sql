-- 031: Rebrand the protect_tenant_admin_fields() error text UltraQuote → SmartProps.
-- Same guard/behavior as migration 013 — only the user-facing exception messages
-- change. CREATE OR REPLACE updates the function body in place; the existing
-- BEFORE-UPDATE trigger on public.tenants keeps pointing at it (no trigger change).

create or replace function public.protect_tenant_admin_fields()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null then
    if new.name is distinct from old.name then
      raise exception 'Company name is managed by SmartProps and cannot be changed here.';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Contact email is managed by SmartProps and cannot be changed here.';
    end if;
  end if;
  return new;
end;
$$;
