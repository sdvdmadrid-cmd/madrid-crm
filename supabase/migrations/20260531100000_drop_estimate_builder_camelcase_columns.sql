-- Paquete H: drop legacy camelCase duplicate columns from estimate_builder.
--
-- The original create_estimate_builder migration carried both snake_case and
-- quoted-camelCase variants for client_id / quote_id / last_sent_at so the
-- API could write either shape during a transitional period. That window has
-- closed: every writer in the app populates the snake_case column. The
-- camelCase columns are now dead weight that desyncs from snake_case on any
-- direct SQL update and confuses anyone reading the schema.
--
-- This migration:
--   1. Backfills snake_case from camelCase wherever snake_case is NULL but
--      the camelCase column still holds a value (defensive, in case any row
--      slipped through).
--   2. Drops the three camelCase columns.
--
-- The API layer keeps emitting camelCase aliases (clientId, quoteId,
-- lastSentAt) in its JSON response after this change, so the frontend is
-- unaffected.

begin;

update public.estimate_builder
   set client_id = "clientId"
 where client_id is null
   and "clientId" is not null;

update public.estimate_builder
   set quote_id = "quoteId"
 where quote_id is null
   and "quoteId" is not null;

update public.estimate_builder
   set last_sent_at = "lastSentAt"
 where last_sent_at is null
   and "lastSentAt" is not null;

alter table public.estimate_builder drop column if exists "clientId";
alter table public.estimate_builder drop column if exists "quoteId";
alter table public.estimate_builder drop column if exists "lastSentAt";

commit;
