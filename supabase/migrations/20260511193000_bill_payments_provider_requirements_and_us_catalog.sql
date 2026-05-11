begin;

alter table public.bill_providers
  add column if not exists required_fields jsonb not null default '[]'::jsonb,
  add column if not exists remittance_channel text not null default 'manual_portal',
  add column if not exists settlement_support text not null default 'funding_only',
  add column if not exists remittance_notes text not null default '';

alter table public.bills
  add column if not exists provider_identifiers jsonb not null default '{}'::jsonb;

update public.bill_providers
set
  required_fields = '[{"key":"account_number","label":"Account number","required":true,"hint":"Use the account number exactly as it appears on the bill."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP code on the billing statement."}]'::jsonb,
  remittance_channel = 'manual_portal',
  settlement_support = 'funding_only',
  remittance_notes = 'Funding is captured in-app. Provider posting still depends on external biller-network integration.'
where category in ('utilities', 'internet', 'phone')
  and (required_fields = '[]'::jsonb or required_fields is null);

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
values
  (
    'ComEd',
    'comed',
    'utilities',
    'https://www.comed.com',
    '800-334-7661',
    array['electric','utility','comed','illinois'],
    '[{"key":"account_number","label":"ComEd account number","required":true,"hint":"Found on your ComEd bill."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP tied to the ComEd account."},{"key":"service_address_line1","label":"Service address","required":true,"hint":"Primary service address line."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'ComEd bill posting requires external biller-network/remittance integration.'
  ),
  (
    'Con Edison',
    'con edison',
    'utilities',
    'https://www.coned.com',
    '800-752-6633',
    array['electric','gas','utility','coned','con edison','new york'],
    '[{"key":"account_number","label":"Con Edison account number","required":true,"hint":"From your utility statement."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP on the billing statement."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Con Edison settlement not yet automated from this app.'
  ),
  (
    'Duke Energy',
    'duke energy',
    'utilities',
    'https://www.duke-energy.com',
    '800-777-9898',
    array['electric','utility','duke'],
    '[{"key":"account_number","label":"Duke account number","required":true,"hint":"From your Duke bill."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP on file with Duke."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Requires external remittance adapter for automated posting.'
  ),
  (
    'Florida Power & Light',
    'florida power and light',
    'utilities',
    'https://www.fpl.com',
    '800-226-3545',
    array['electric','utility','fpl'],
    '[{"key":"account_number","label":"FPL account number","required":true,"hint":"From your FPL bill."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP on the account."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Automated settlement depends on biller-network integration.'
  ),
  (
    'National Grid',
    'national grid',
    'utilities',
    'https://www.nationalgridus.com',
    '800-930-5003',
    array['electric','gas','utility','national grid'],
    '[{"key":"account_number","label":"National Grid account number","required":true,"hint":"Utility account number."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP code from statement."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Posting to National Grid requires outbound remittance adapter.'
  ),
  (
    'PSEG',
    'pseg',
    'utilities',
    'https://www.pseg.com',
    '800-436-7734',
    array['electric','gas','utility','pseg'],
    '[{"key":"account_number","label":"PSEG account number","required":true,"hint":"Account number from statement."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP associated with the account."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'PSEG settlement not automated yet in this repository.'
  ),
  (
    'Dominion Energy',
    'dominion energy',
    'utilities',
    'https://www.dominionenergy.com',
    '866-366-4357',
    array['electric','gas','utility','dominion'],
    '[{"key":"account_number","label":"Dominion account number","required":true,"hint":"From utility statement."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP on file with Dominion."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Requires remittance network integration for provider posting.'
  ),
  (
    'Xcel Energy',
    'xcel energy',
    'utilities',
    'https://www.xcelenergy.com',
    '800-895-4999',
    array['electric','gas','utility','xcel'],
    '[{"key":"account_number","label":"Xcel account number","required":true,"hint":"From your Xcel statement."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP from billing statement."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Funding works in-app; remittance posting is pending integration.'
  ),
  (
    'SoCalGas',
    'socalgas',
    'utilities',
    'https://www.socalgas.com',
    '877-238-0092',
    array['gas','utility','socalgas'],
    '[{"key":"account_number","label":"SoCalGas account number","required":true,"hint":"From your gas bill."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP tied to account."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Automated settlement requires biller-network support.'
  ),
  (
    'American Water',
    'american water',
    'utilities',
    'https://www.amwater.com',
    '800-272-1325',
    array['water','utility','american water'],
    '[{"key":"account_number","label":"Water account number","required":true,"hint":"From your water bill."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP from statement."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Water utility posting requires remittance adapter.'
  ),
  (
    'Verizon Business',
    'verizon business',
    'internet',
    'https://www.verizon.com/business',
    '800-465-4054',
    array['internet','phone','wireless','verizon'],
    '[{"key":"account_number","label":"Verizon account number","required":true,"hint":"From invoice statement."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP on Verizon billing profile."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Automated posting to Verizon is not yet integrated.'
  ),
  (
    'T-Mobile for Business',
    't-mobile for business',
    'internet',
    'https://www.t-mobile.com/business',
    '800-375-1126',
    array['wireless','phone','mobile','t-mobile'],
    '[{"key":"account_number","label":"T-Mobile account number","required":true,"hint":"From your T-Mobile statement."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP on account profile."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Requires remittance-network integration for settlement.'
  ),
  (
    'Spectrum Business',
    'spectrum business',
    'internet',
    'https://business.spectrum.com',
    '866-892-4249',
    array['internet','phone','cable','spectrum'],
    '[{"key":"account_number","label":"Spectrum account number","required":true,"hint":"From Spectrum invoice."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP tied to Spectrum billing."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Provider posting requires external remittance integration.'
  ),
  (
    'Xfinity',
    'xfinity',
    'internet',
    'https://www.xfinity.com',
    '800-934-6489',
    array['internet','phone','xfinity','comcast'],
    '[{"key":"account_number","label":"Xfinity account number","required":true,"hint":"From Xfinity invoice."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP on billing account."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Automated settlement to Xfinity not yet available.'
  ),
  (
    'State Farm',
    'state farm',
    'insurance',
    'https://www.statefarm.com',
    '800-782-8332',
    array['insurance','auto','home','state farm'],
    '[{"key":"policy_number","label":"Policy number","required":true,"hint":"Insurance policy number."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP on policy billing profile."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Insurance posting requires provider-network integration.'
  ),
  (
    'GEICO',
    'geico',
    'insurance',
    'https://www.geico.com',
    '800-207-7847',
    array['insurance','auto','geico'],
    '[{"key":"policy_number","label":"Policy number","required":true,"hint":"GEICO policy number."},{"key":"billing_zip","label":"Billing ZIP code","required":true,"hint":"ZIP associated with policy."}]'::jsonb,
    'manual_portal',
    'funding_only',
    'Automated remittance to GEICO is not configured yet.'
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
