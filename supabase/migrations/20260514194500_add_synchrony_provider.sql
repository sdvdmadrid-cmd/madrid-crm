begin;

insert into public.bill_providers (
  provider_name,
  normalized_name,
  category,
  website_url,
  support_phone,
  search_terms,
  required_fields,
  remittance_channel,
  settlement_support,
  remittance_notes
)
values (
  'Synchrony Bank',
  'synchrony bank',
  'credit_card',
  'https://www.synchrony.com',
  '866-419-4096',
  array[
    'synchrony',
    'synchrony bank',
    'synchrony financial',
    'store card',
    'credit card',
    'carecredit',
    'amazon store card',
    'lowes',
    'tj maxx',
    'macys'
  ],
  '[{"key":"account_number","label":"Account number","required":true,"hint":"Use the account number exactly as it appears on your Synchrony statement."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP code on the Synchrony billing statement."}]'::jsonb,
  'manual_portal',
  'funding_only',
  'Synchrony settlement still depends on the provider portal or network integration.'
)
on conflict (normalized_name) do update
set
  provider_name = excluded.provider_name,
  category = excluded.category,
  website_url = excluded.website_url,
  support_phone = excluded.support_phone,
  search_terms = excluded.search_terms,
  required_fields = excluded.required_fields,
  remittance_channel = excluded.remittance_channel,
  settlement_support = excluded.settlement_support,
  remittance_notes = excluded.remittance_notes,
  updated_at = timezone('utc', now());

commit;
