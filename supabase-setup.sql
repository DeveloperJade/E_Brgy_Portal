-- E-Barangay Portal: run this once in the Supabase SQL Editor.

-- 1. Profiles (one row per auth user; holds the role used for routing) ------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  purok       text,
  role        text not null default 'citizen' check (role in ('citizen', 'admin')),
  created_at  timestamptz not null default now()
);

-- Every new sign-up becomes a 'citizen'. The role is never read from client metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, purok, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'purok',
    'citizen'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- 2. Announcements ------------------------------------------------------------
create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  category     text not null default 'General',
  image_url    text,
  image_urls   text[] not null default '{}',
  author_id    uuid references public.profiles (id) on delete set null,
  author_name  text,
  created_at   timestamptz not null default now()
);

-- 3. Complaints and suggestions (with AI metadata) -----------------------------
create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  type          text not null check (type in ('complaint', 'suggestion')),
  title         text not null,
  description   text not null,
  location      text,
  image_url     text,
  ai_sentiment  text,
  ai_category   text,
  ai_priority   text check (ai_priority in ('High', 'Medium', 'Low')),
  ai_summary    text,
  status        text not null default 'Pending' check (status in ('Pending', 'In Progress', 'Resolved')),
  created_at    timestamptz not null default now()
);

create index if not exists submissions_user_idx    on public.submissions (user_id);
create index if not exists submissions_created_idx on public.submissions (created_at desc);

-- 4. Row Level Security -------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.announcements  enable row level security;
alter table public.submissions    enable row level security;

-- profiles: read your own row; admins read all. Nobody edits roles from the client.
drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- announcements: any signed-in user reads; only admins write.
drop policy if exists "announcements read" on public.announcements;
create policy "announcements read" on public.announcements
  for select to authenticated using (true);

drop policy if exists "announcements admin insert" on public.announcements;
create policy "announcements admin insert" on public.announcements
  for insert to authenticated with check (public.is_admin());

drop policy if exists "announcements admin update" on public.announcements;
create policy "announcements admin update" on public.announcements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "announcements admin delete" on public.announcements;
create policy "announcements admin delete" on public.announcements
  for delete to authenticated using (public.is_admin());

-- submissions: residents insert and read their own; admins read all and change status.
drop policy if exists "submissions insert own" on public.submissions;
create policy "submissions insert own" on public.submissions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "submissions read own or admin" on public.submissions;
create policy "submissions read own or admin" on public.submissions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "submissions admin update" on public.submissions;
create policy "submissions admin update" on public.submissions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 5. Storage bucket for attachments -------------------------------------------
insert into storage.buckets (id, name, public)
values ('submission-images', 'submission-images', true)
on conflict (id) do nothing;

-- Residents may upload only into a folder named after their own user id.
drop policy if exists "residents upload own folder" on storage.objects;
create policy "residents upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submission-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. Create your first staff account -------------------------------------------
-- Sign up once through the Resident portal with the staff email, then run:
--
--   update public.profiles
--   set role = 'admin'
--   where id = (select id from auth.users where email = 'staff@yourbarangay.gov.ph');

-- 7. Already ran this script before? Run these to add the photo columns to announcements.
alter table public.announcements add column if not exists image_url text;
alter table public.announcements add column if not exists image_urls text[] not null default '{}';
