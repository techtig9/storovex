-- Store-level shipping, tax and storefront branding.
--
-- ADDITIVE ONLY: adds nullable columns with defaults to `stores`. No existing
-- column is altered, no row is touched, and every default matches the behaviour
-- the code had before this ran (no shipping, no tax), so applying it changes
-- nothing until a merchant sets a value.
--
-- Why these live on `stores` rather than their own tables: each is one value per
-- store with no history and no relationships. A `shipping_rates` table would be
-- the right answer for per-region or per-weight pricing, and that is a later
-- change; a flat rate and a free-over threshold cover what a small shop needs and
-- can be reasoned about on one screen.

alter table public.stores
  -- Flat shipping charged once per order, per store. A multi-store basket is
  -- several orders, so each merchant charges their own postage — which is correct:
  -- they each ship their own parcel.
  add column if not exists shipping_flat_rate numeric not null default 0,

  -- Orders at or above this subtotal ship free. Null means never free.
  add column if not exists shipping_free_threshold numeric,

  -- Basis points, not a percentage, for the same reason the platform fee is:
  -- 8.25% is 825 and stays an integer, where 0.0825 invites float drift.
  add column if not exists tax_basis_points integer not null default 0,

  -- Storefront branding.
  add column if not exists tagline text,
  add column if not exists about text,
  add column if not exists logo_url text,
  add column if not exists theme_accent text;

-- Guards, because these are numbers a merchant types.
alter table public.stores drop constraint if exists stores_shipping_flat_rate_non_negative;
alter table public.stores add constraint stores_shipping_flat_rate_non_negative
  check (shipping_flat_rate >= 0);

alter table public.stores drop constraint if exists stores_shipping_free_threshold_non_negative;
alter table public.stores add constraint stores_shipping_free_threshold_non_negative
  check (shipping_free_threshold is null or shipping_free_threshold >= 0);

-- 0 to 10000 basis points is 0% to 100%. A tax rate above 100% is always a typo,
-- and one stored as 825000 instead of 825 would silently overcharge every customer.
alter table public.stores drop constraint if exists stores_tax_basis_points_range;
alter table public.stores add constraint stores_tax_basis_points_range
  check (tax_basis_points >= 0 and tax_basis_points <= 10000);

-- The accent colour is rendered into a stylesheet on a public page, so it is
-- constrained to a hex literal rather than trusted as free text.
alter table public.stores drop constraint if exists stores_theme_accent_is_hex;
alter table public.stores add constraint stores_theme_accent_is_hex
  check (theme_accent is null or theme_accent ~ '^#[0-9A-Fa-f]{6}$');

-- The shopper-facing columns join the existing public grant. shipping and tax are
-- included deliberately: a storefront that cannot see them cannot show postage
-- before checkout, and a total that appears only at the payment step is the
-- single most common reason a basket is abandoned.
grant select (
  id, name, slug, created_at,
  tagline, about, logo_url, theme_accent,
  shipping_flat_rate, shipping_free_threshold, tax_basis_points
) on public.stores to anon, authenticated;

grant update (
  name, slug, tagline, about, logo_url, theme_accent,
  shipping_flat_rate, shipping_free_threshold, tax_basis_points
) on public.stores to authenticated;
