begin;

alter table if exists public.clients
  drop column if exists preferred_language;

alter table if exists public.invoices
  drop column if exists type,
  drop column if exists stripe_payment_intent_id;

notify pgrst, 'reload schema';

commit;