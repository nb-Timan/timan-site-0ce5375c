-- Additive CRM lead contact normalization. The historical contact_information
-- value remains untouched as the raw/audit source for legacy records.
alter table public.crm_leads
  add column if not exists lead_reference_type text not null default 'L',
  add column if not exists company_name text,
  add column if not exists company_cvr text,
  add column if not exists contact_person_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists linked_dealer_contact_id uuid references public.dealer_contacts(id) on delete set null;

alter table public.crm_leads
  drop constraint if exists crm_leads_lead_reference_type_check,
  add constraint crm_leads_lead_reference_type_check
    check (lead_reference_type in ('L', 'G'));

comment on column public.crm_leads.lead_reference_type is
  'Canonical lead series: L = portal-created lead, G = historical imported lead.';
comment on column public.crm_leads.contact_information is
  'Legacy/raw contact snapshot retained for audit and compatibility; structured contact columns are canonical.';
comment on column public.crm_leads.linked_dealer_contact_id is
  'Optional canonical Partnerdata contact selected when dealer details were copied to the lead.';

-- The production sequence is the L-series (currently below 5000). Historical
-- imports occupy the reserved G-series 5000-5755, including three imported
-- rows whose notes were later replaced but retain their import IDs/timestamp.
update public.crm_leads
set lead_reference_type = case when lead_no >= 5000 then 'G' else 'L' end;

with source as (
  select
    id,
    split_part(replace(contact_information, chr(13), ''), E'\nOprindelig kontaktinfo:', 1) as head
  from public.crm_leads
  where nullif(btrim(contact_information), '') is not null
), parsed as (
  select
    id,
    nullif(btrim((regexp_match(head, '(?im)^Firma/CVR:[[:space:]]*([^\n]+)$'))[1]), '') as company_token,
    nullif(btrim((regexp_match(head, '(?im)^Kontaktperson:[[:space:]]*([^\n]+)$'))[1]), '') as contact_person_value,
    nullif(btrim((regexp_match(head, '(?im)^Telefon:[[:space:]]*([^\n]+)$'))[1]), '') as phone_value,
    nullif(btrim((regexp_match(head, '(?im)^E-mail:[[:space:]]*([^\n]+)$'))[1]), '') as email_value,
    nullif(btrim((regexp_match(head, '(?im)^Adresse:[[:space:]]*([^\n]+)$'))[1]), '') as address_value,
    nullif(btrim((regexp_match(head, '(?im)^Postnr[.]*:[[:space:]]*([^\n]+)$'))[1]), '') as postal_explicit,
    nullif(btrim((regexp_match(head, '(?im)^By:[[:space:]]*([^\n]+)$'))[1]), '') as city_explicit,
    nullif(btrim((regexp_match(head, '(?im)^Postnr[.]? og by:[[:space:]]*([^\n]+)$'))[1]), '') as postal_city
  from source
), safe_values as (
  select
    id,
    case
      when company_token ~* '/[[:space:]]*[A-Z]{0,2}[0-9][0-9 .-]{7,}[[:space:]]*$'
        then nullif(btrim(regexp_replace(company_token, '[[:space:]]*/[[:space:]]*[A-Z]{0,2}[0-9][0-9 .-]{7,}[[:space:]]*$', '', 'i')), '')
      else company_token
    end as company_name_value,
    case
      when company_token ~* '/[[:space:]]*[A-Z]{0,2}[0-9][0-9 .-]{7,}[[:space:]]*$'
        then upper(regexp_replace(regexp_replace(company_token, '^.*/[[:space:]]*', ''), '[[:space:].-]', '', 'g'))
      else null
    end as company_cvr_value,
    contact_person_value,
    phone_value,
    email_value,
    address_value,
    coalesce(
      postal_explicit,
      case when postal_city ~* '^[A-Z]{0,3}[- ]?[0-9]{3,6}[[:space:]]+.+$'
        then (regexp_match(postal_city, '^([A-Z]{0,3}[- ]?[0-9]{3,6})[[:space:]]+(.+)$', 'i'))[1]
      end
    ) as postal_code_value,
    coalesce(
      city_explicit,
      case when postal_city ~* '^[A-Z]{0,3}[- ]?[0-9]{3,6}[[:space:]]+.+$'
        then (regexp_match(postal_city, '^([A-Z]{0,3}[- ]?[0-9]{3,6})[[:space:]]+(.+)$', 'i'))[2]
      end
    ) as city_value
  from parsed
)
update public.crm_leads lead
set
  company_name = coalesce(lead.company_name, values.company_name_value),
  company_cvr = coalesce(lead.company_cvr, values.company_cvr_value),
  contact_person_name = coalesce(lead.contact_person_name, values.contact_person_value),
  phone = coalesce(lead.phone, values.phone_value),
  email = coalesce(lead.email, values.email_value),
  address = coalesce(lead.address, values.address_value),
  postal_code = coalesce(lead.postal_code, values.postal_code_value),
  city = coalesce(lead.city, values.city_value)
from safe_values values
where lead.id = values.id;

create index if not exists idx_crm_leads_reference_type
  on public.crm_leads (lead_reference_type, lead_no);
create index if not exists idx_crm_leads_linked_dealer_contact
  on public.crm_leads (linked_dealer_contact_id)
  where linked_dealer_contact_id is not null;

-- Compatibility guard for existing server-side writers that still provide a
-- labelled contact_information snapshot. It only fills missing structured
-- values and never guesses from the unlabelled original-import section.
create or replace function public.normalize_crm_lead_contact_on_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_head text;
  v_company text;
  v_postal_city text;
  v_match text[];
begin
  if nullif(btrim(new.contact_information), '') is null then
    return new;
  end if;

  v_head := split_part(replace(new.contact_information, chr(13), ''), E'\nOprindelig kontaktinfo:', 1);
  v_company := nullif(btrim((regexp_match(v_head, '(?im)^Firma/CVR:[[:space:]]*([^\n]+)$'))[1]), '');

  if new.company_name is null and v_company is not null then
    if v_company ~* '/[[:space:]]*[A-Z]{0,2}[0-9][0-9 .-]{7,}[[:space:]]*$' then
      new.company_name := nullif(btrim(regexp_replace(v_company, '[[:space:]]*/[[:space:]]*[A-Z]{0,2}[0-9][0-9 .-]{7,}[[:space:]]*$', '', 'i')), '');
    else
      new.company_name := v_company;
    end if;
  end if;
  if new.company_cvr is null and v_company ~* '/[[:space:]]*[A-Z]{0,2}[0-9][0-9 .-]{7,}[[:space:]]*$' then
    new.company_cvr := upper(regexp_replace(regexp_replace(v_company, '^.*/[[:space:]]*', ''), '[[:space:].-]', '', 'g'));
  end if;

  new.contact_person_name := coalesce(new.contact_person_name,
    nullif(btrim((regexp_match(v_head, '(?im)^Kontaktperson:[[:space:]]*([^\n]+)$'))[1]), ''));
  new.phone := coalesce(new.phone,
    nullif(btrim((regexp_match(v_head, '(?im)^Telefon:[[:space:]]*([^\n]+)$'))[1]), ''));
  new.email := coalesce(new.email,
    nullif(btrim((regexp_match(v_head, '(?im)^E-mail:[[:space:]]*([^\n]+)$'))[1]), ''));
  new.address := coalesce(new.address,
    nullif(btrim((regexp_match(v_head, '(?im)^Adresse:[[:space:]]*([^\n]+)$'))[1]), ''));
  new.postal_code := coalesce(new.postal_code,
    nullif(btrim((regexp_match(v_head, '(?im)^Postnr[.]*:[[:space:]]*([^\n]+)$'))[1]), ''));
  new.city := coalesce(new.city,
    nullif(btrim((regexp_match(v_head, '(?im)^By:[[:space:]]*([^\n]+)$'))[1]), ''));
  new.country := coalesce(new.country,
    nullif(btrim((regexp_match(v_head, '(?im)^Land:[[:space:]]*([^\n]+)$'))[1]), ''));

  v_postal_city := nullif(btrim((regexp_match(v_head, '(?im)^Postnr[.]? og by:[[:space:]]*([^\n]+)$'))[1]), '');
  if v_postal_city ~* '^[A-Z]{0,3}[- ]?[0-9]{3,6}[[:space:]]+.+$' then
    v_match := regexp_match(v_postal_city, '^([A-Z]{0,3}[- ]?[0-9]{3,6})[[:space:]]+(.+)$', 'i');
    new.postal_code := coalesce(new.postal_code, v_match[1]);
    new.city := coalesce(new.city, v_match[2]);
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_crm_lead_contact_on_write() from public, anon, authenticated;

drop trigger if exists normalize_crm_lead_contact_on_write on public.crm_leads;
create trigger normalize_crm_lead_contact_on_write
before insert or update of contact_information, company_name, company_cvr,
  contact_person_name, phone, email, address, postal_code, city, country
on public.crm_leads
for each row execute function public.normalize_crm_lead_contact_on_write();
