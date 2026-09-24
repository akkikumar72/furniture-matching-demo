-- Apply once in the Supabase SQL editor. All application access is server-side.
create extension if not exists vector with schema extensions;

create table if not exists public.furniture_products (
  id uuid primary key,
  name text not null,
  brand text,
  category text,
  created_at timestamptz not null default now()
);
create table if not exists public.furniture_variants (
  id uuid primary key,
  product_id uuid not null references public.furniture_products(id) on delete cascade,
  product_key text not null unique,
  sku text,
  attributes jsonb not null default '{}'
);
create table if not exists public.furniture_images (
  id uuid primary key,
  variant_id uuid not null references public.furniture_variants(id) on delete cascade,
  original_url text not null,
  storage_path text not null,
  content_hash text not null,
  description text not null,
  embedding extensions.vector(1536) not null,
  embedding_model text not null default 'text-embedding-3-small',
  description_model text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.furniture_offers (
  id uuid primary key,
  variant_id uuid not null references public.furniture_variants(id) on delete cascade,
  country text not null check (country in ('SE', 'DE', 'GB')),
  listing_url text not null,
  evidence jsonb not null,
  checked_at timestamptz not null,
  unique (variant_id, country, listing_url)
);
create table if not exists public.furniture_cache (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz not null
);
create index if not exists furniture_offers_country on public.furniture_offers(country, variant_id);
create index if not exists furniture_images_variant on public.furniture_images(variant_id);

alter table public.furniture_products enable row level security;
alter table public.furniture_variants enable row level security;
alter table public.furniture_images enable row level security;
alter table public.furniture_offers enable row level security;
alter table public.furniture_cache enable row level security;
revoke all on public.furniture_products, public.furniture_variants, public.furniture_images,
  public.furniture_offers, public.furniture_cache from anon, authenticated;
grant all on public.furniture_products, public.furniture_variants, public.furniture_images,
  public.furniture_offers, public.furniture_cache to service_role;

create or replace function public.match_furniture_images(
  query_embedding extensions.vector(1536), target_country text, match_count integer default 20
) returns table (
  variant_id uuid, product_key text, name text, brand text, category text,
  image_url text, storage_path text, offer jsonb, similarity double precision
) language sql stable security invoker set search_path = public, extensions as $$
  select v.id, v.product_key, coalesce(v.attributes->>'displayName', p.name), p.brand, p.category,
    best.original_url, best.storage_path, o.evidence, best.similarity
  from furniture_variants v
  join furniture_products p on p.id = v.product_id
  join lateral (
    select i.original_url, i.storage_path, 1 - (i.embedding <=> query_embedding) as similarity
    from furniture_images i
    where i.variant_id = v.id and i.embedding_model = 'text-embedding-3-small'
    order by i.embedding <=> query_embedding limit 1
  ) best on true
  join lateral (
    select f.evidence from furniture_offers f
    where f.variant_id = v.id and f.country = target_country
    order by f.checked_at desc limit 1
  ) o on true
  order by best.similarity desc
  limit least(greatest(match_count, 1), 30);
$$;
revoke execute on function public.match_furniture_images(extensions.vector, text, integer) from public, anon, authenticated;
grant execute on function public.match_furniture_images(extensions.vector, text, integer) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('furniture-images', 'furniture-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
