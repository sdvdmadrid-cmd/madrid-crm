begin;

alter table if exists public.quotes
  add column if not exists quote_approved_by_name text not null default '',
  add column if not exists quote_approved_by_email text not null default '',
  add column if not exists quote_signed_by_name text not null default '',
  add column if not exists quote_signed_by_email text not null default '',
  add column if not exists quote_signature_text text not null default '',
  add column if not exists quote_signed_at timestamptz;

update public.quotes
set
  quote_approved_by_name = coalesce(quote_approved_by_name, ''),
  quote_approved_by_email = coalesce(quote_approved_by_email, ''),
  quote_signed_by_name = coalesce(quote_signed_by_name, ''),
  quote_signed_by_email = coalesce(quote_signed_by_email, ''),
  quote_signature_text = coalesce(quote_signature_text, '')
where
  quote_approved_by_name is null
  or quote_approved_by_email is null
  or quote_signed_by_name is null
  or quote_signed_by_email is null
  or quote_signature_text is null;

notify pgrst, 'reload schema';

commit;
