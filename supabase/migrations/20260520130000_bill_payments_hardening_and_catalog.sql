begin;

-- RLS for platform fees (defense in depth)
alter table public.bill_payment_platform_fees enable row level security;

drop policy if exists bill_payment_platform_fees_tenant_access on public.bill_payment_platform_fees;
create policy bill_payment_platform_fees_tenant_access
  on public.bill_payment_platform_fees
  for all
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));

-- National payee catalog expansion (Doxo-style categories)
-- funding_only = Stripe captures funds; remittance to biller is manual until network adapter is live

insert into public.bill_providers (
  provider_name, normalized_name, category, website_url, support_phone, search_terms,
  required_fields, remittance_channel, settlement_support, remittance_notes
)
values
  ('Chase Card Services', 'chase card services', 'credit_card', 'https://www.chase.com', '800-432-3117', array['chase','credit card','visa','mastercard'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Funding in-app; post payment on Chase portal or via future biller network.'),
  ('Citi Credit Card', 'citi credit card', 'credit_card', 'https://www.citi.com', '800-950-5114', array['citi','credit card'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance until RPPS/network integration.'),
  ('American Express', 'american express', 'credit_card', 'https://www.americanexpress.com', '800-528-4800', array['amex','american express','credit'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Capital One', 'capital one', 'credit_card', 'https://www.capitalone.com', '800-227-4825', array['capital one','credit card'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Discover Card', 'discover card', 'credit_card', 'https://www.discover.com', '800-347-2683', array['discover','credit card'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Bank of America Card', 'bank of america card', 'credit_card', 'https://www.bankofamerica.com', '800-421-2110', array['bofa','bank of america','credit'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Wells Fargo Card', 'wells fargo card', 'credit_card', 'https://www.wellsfargo.com', '800-642-4720', array['wells fargo','credit card'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Apple Card (Goldman Sachs)', 'apple card goldman sachs', 'credit_card', 'https://www.apple.com/apple-card', '877-255-5923', array['apple card','goldman'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Toyota Financial Services', 'toyota financial services', 'auto_finance', 'https://www.toyotafinancial.com', '800-874-8822', array['toyota','auto loan','dealer'], '[{"key":"account_number","label":"Loan account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Auto lender — confirm on lender portal after funding.'),
  ('Ford Motor Credit', 'ford motor credit', 'auto_finance', 'https://www.ford.com/finance', '800-727-7000', array['ford credit','auto','dealer'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Ally Auto', 'ally auto', 'auto_finance', 'https://www.ally.com/auto', '888-925-2559', array['ally','auto loan'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('GM Financial', 'gm financial', 'auto_finance', 'https://www.gmfinancial.com', '800-284-2271', array['gm','chevrolet','auto loan'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Honda Financial Services', 'honda financial services', 'auto_finance', 'https://www.hondafinancialservices.com', '800-538-3222', array['honda','acura','auto'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Progressive Insurance', 'progressive insurance', 'insurance', 'https://www.progressive.com', '800-776-4737', array['progressive','auto insurance'], '[{"key":"account_number","label":"Policy or account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Insurance premium — post on carrier site.'),
  ('Allstate', 'allstate', 'insurance', 'https://www.allstate.com', '800-255-7828', array['allstate','insurance'], '[{"key":"account_number","label":"Policy number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('USAA', 'usaa', 'insurance', 'https://www.usaa.com', '800-531-8722', array['usaa','insurance','bank'], '[{"key":"account_number","label":"USAA account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Verizon Wireless', 'verizon wireless', 'internet', 'https://www.verizon.com', '800-922-0204', array['verizon','wireless','phone'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Telecom — manual portal posting.'),
  ('T-Mobile', 't-mobile', 'internet', 'https://www.t-mobile.com', '800-937-8997', array['tmobile','t mobile','phone'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('AT&T', 'at&t', 'internet', 'https://www.att.com', '800-288-2020', array['att','at&t','phone','internet'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Xfinity (Comcast)', 'xfinity comcast', 'internet', 'https://www.xfinity.com', '800-934-6489', array['xfinity','comcast','internet'], '[{"key":"account_number","label":"Account number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('IRS (US Treasury)', 'irs us treasury', 'government', 'https://www.irs.gov', '800-829-1040', array['irs','tax','treasury'], '[{"key":"account_number","label":"Taxpayer ID / notice number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Tax payments require IRS-approved channels for final settlement.'),
  ('DMV / State Motor Vehicle', 'dmv state motor vehicle', 'government', 'https://www.dmv.org', '', array['dmv','registration','vehicle'], '[{"key":"account_number","label":"Notice or plate number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'State DMV varies — manual confirmation required.'),
  ('Anthem Blue Cross', 'anthem blue cross', 'healthcare', 'https://www.anthem.com', '800-676-2583', array['anthem','health','medical'], '[{"key":"account_number","label":"Member ID","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Healthcare payer — manual posting.'),
  ('Kaiser Permanente', 'kaiser permanente', 'healthcare', 'https://www.kp.org', '800-464-4000', array['kaiser','health'], '[{"key":"account_number","label":"Medical record / bill account","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Manual remittance.'),
  ('Quicken Loans / Rocket Mortgage', 'rocket mortgage', 'mortgage_rent', 'https://www.rocketmortgage.com', '800-508-0944', array['rocket','mortgage','quicken'], '[{"key":"account_number","label":"Loan number","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'Mortgage servicer — manual confirmation.'),
  ('Fannie Mae Landlord / HOA (Generic)', 'hoa generic', 'mortgage_rent', '', '', array['hoa','homeowners','association','rent'], '[{"key":"account_number","label":"HOA account or unit","required":true}]'::jsonb, 'manual_portal', 'funding_only', 'HOA/landlord — use provider name from statement.')
on conflict (normalized_name) do update set
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

notify pgrst, 'reload schema';

commit;
