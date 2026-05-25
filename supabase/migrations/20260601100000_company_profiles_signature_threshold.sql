-- Paquete I: require a typed customer signature on estimate approvals above
-- a contractor-configured dollar threshold.
--
-- A NULL threshold means "no signature required" (the default for all
-- existing tenants, so behavior is unchanged until a contractor opts in).
-- A positive threshold means "require signature when total > threshold".
--
-- The numeric type matches the estimate.total / quote.total scale used
-- elsewhere in the app.

alter table public.company_profiles
  add column if not exists signature_required_above_amount numeric(14, 2);
