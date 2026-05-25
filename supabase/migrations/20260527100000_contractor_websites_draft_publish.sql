-- Issue #43 — website builder: queue edits as a draft and require explicit Publish.
--
-- The public site keeps reading the existing top-level columns
-- (headline, subheadline, about_text, cta_text, theme_color, services,
-- gallery_photos, site_meta, published), so no public behavior changes.
-- The builder reads / writes a JSON snapshot in `draft_content` and only
-- the new POST /api/website-builder/publish endpoint promotes the
-- snapshot back into the top-level columns.

alter table public.contractor_websites
  add column if not exists draft_content jsonb default '{}'::jsonb,
  add column if not exists has_unpublished_changes boolean default false,
  add column if not exists last_published_at timestamptz,
  add column if not exists draft_updated_at timestamptz;

-- Backfill: every existing row gets a draft snapshot equal to its current
-- live state. has_unpublished_changes = false so nothing shows as "dirty"
-- right after deploy. last_published_at is approximated from updated_at
-- for rows that were already published.
update public.contractor_websites
set
  draft_content = jsonb_strip_nulls(jsonb_build_object(
    'headline', headline,
    'subheadline', subheadline,
    'aboutText', about_text,
    'ctaText', cta_text,
    'themeColor', theme_color,
    'services', coalesce(services, '[]'::jsonb),
    'galleryPhotos', coalesce(gallery_photos, '[]'::jsonb),
    'siteMeta', coalesce(site_meta, '{}'::jsonb)
  )),
  has_unpublished_changes = false,
  last_published_at = case when published = true then updated_at else null end,
  draft_updated_at = updated_at
where draft_content is null or draft_content = '{}'::jsonb;

create index if not exists contractor_websites_has_unpublished_idx
  on public.contractor_websites (tenant_id)
  where has_unpublished_changes = true;

comment on column public.contractor_websites.draft_content is
  'JSON snapshot of pending edits (headline, services, gallery, etc). Promoted to top-level columns on publish.';
comment on column public.contractor_websites.has_unpublished_changes is
  'True when the draft has edits that have not been published yet. UI uses this to render the yellow "Publish changes" state.';
comment on column public.contractor_websites.last_published_at is
  'Timestamp of the most recent successful publish (server time).';
comment on column public.contractor_websites.draft_updated_at is
  'Last time the draft was touched. Used for diff hashing and stale-draft detection.';
