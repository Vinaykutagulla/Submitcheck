create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  plan_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.manuscripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  raw_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.journals (
  id uuid primary key default gen_random_uuid(),
  source_record_id text unique,
  name text not null,
  issn text,
  eissn text,
  publisher text,
  field text not null,
  source_type text,
  subjects text[] not null default '{}',
  quartile text,
  oa boolean not null default false,
  apc_display text,
  turnaround_days integer,
  indexed text[] not null default '{}',
  scope text[] not null default '{}',
  asjc_codes text[] not null default '{}',
  requirements jsonb not null default '{}',
  sponsored boolean not null default false,
  sponsor_tier text,
  submission_url text,
  search_document text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create table public.indexing_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.journal_subjects (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id) on delete cascade,
  subject text not null,
  created_at timestamptz not null default now(),
  unique (journal_id, subject)
);

create table public.journal_indexings (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id) on delete cascade,
  indexing_source_id uuid references public.indexing_sources(id) on delete set null,
  indexing_name text not null,
  is_primary boolean not null default false,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journal_id, indexing_name)
);

create table public.journal_requirements (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id) on delete cascade,
  abstract_type text not null default 'unstructured' check (abstract_type in ('structured', 'unstructured')),
  word_limit integer,
  ref_style text,
  novelty_required boolean not null default false,
  limitations_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journal_id)
);

create table public.journal_snapshots (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id) on delete cascade,
  snapshot_json jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  version integer not null default 1,
  captured_at timestamptz not null default now(),
  unique (journal_id, version)
);

create table public.manuscript_journal_matches (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  journal_id uuid not null references public.journals(id) on delete cascade,
  fit_score integer not null default 0,
  gaps jsonb not null default '[]'::jsonb,
  fixed_gap_ids text[] not null default '{}',
  formatting_reviewed boolean not null default false,
  verification_complete boolean not null default false,
  created_at timestamptz not null default now(),
  unique (manuscript_id, journal_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  provider_payment_id text unique,
  amount integer not null,
  currency text not null default 'INR',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  plan text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.manuscripts enable row level security;
alter table public.journals enable row level security;
alter table public.indexing_sources enable row level security;
alter table public.journal_subjects enable row level security;
alter table public.journal_indexings enable row level security;
alter table public.journal_requirements enable row level security;
alter table public.journal_snapshots enable row level security;
alter table public.manuscript_journal_matches enable row level security;
alter table public.payments enable row level security;

create policy "owners read profiles" on public.profiles for select using (auth.uid() = id);
create policy "owners update profiles" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "owners manage manuscripts" on public.manuscripts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "authenticated users read journals" on public.journals for select using (auth.role() = 'authenticated');
create policy "authenticated users read indexing sources" on public.indexing_sources for select using (auth.role() = 'authenticated');
create policy "authenticated users read journal subjects" on public.journal_subjects for select using (auth.role() = 'authenticated');
create policy "authenticated users read journal indexings" on public.journal_indexings for select using (auth.role() = 'authenticated');
create policy "authenticated users read journal requirements" on public.journal_requirements for select using (auth.role() = 'authenticated');
create policy "authenticated users read journal snapshots" on public.journal_snapshots for select using (auth.role() = 'authenticated');
create policy "owners manage matches" on public.manuscript_journal_matches for all using (
  exists (select 1 from public.manuscripts where id = manuscript_id and user_id = auth.uid())
) with check (
  exists (select 1 from public.manuscripts where id = manuscript_id and user_id = auth.uid())
);
create policy "owners read payments" on public.payments for select using (auth.uid() = user_id);

create index idx_journals_field_quartile on public.journals (field, quartile);
create index idx_journals_updated_at on public.journals (updated_at desc);
create index idx_journals_last_synced_at on public.journals (last_synced_at desc);
create index idx_journals_name_trgm on public.journals using gin (name gin_trgm_ops);
create index idx_journals_search_document on public.journals using gin (search_document gin_trgm_ops);
create index idx_journal_subjects_subject on public.journal_subjects (subject);
create index idx_journal_indexings_name on public.journal_indexings (indexing_name);
create index idx_journal_indexings_source_id on public.journal_indexings (indexing_source_id);
create index idx_journal_requirements_word_limit on public.journal_requirements (word_limit);
create index idx_journal_snapshots_captured_at on public.journal_snapshots (captured_at desc);

insert into public.indexing_sources (name, category, is_active)
values
  ('Scopus', 'citation', true),
  ('Web of Science', 'citation', true),
  ('PubMed', 'medical', true),
  ('DOAJ', 'open_access', true),
  ('Embase', 'medical', true),
  ('CINAHL', 'nursing', true),
  ('PsycINFO', 'psychology', true),
  ('ERIC', 'education', true),
  ('Ei Compendex', 'engineering', true),
  ('INSPEC', 'engineering', true),
  ('MathSciNet', 'mathematics', true),
  ('EBSCO', 'discovery', true)
on conflict (name) do update set is_active = excluded.is_active, updated_at = now();
