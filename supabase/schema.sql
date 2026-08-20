-- Café de Ghouli — инвентаризация в УЖЕ СУЩЕСТВУЮЩЕМ проекте Supabase
--
-- Можно не создавать новый проект. Откройте свой текущий проект:
-- 1. SQL Editor → New query → вставьте этот файл целиком → Run
-- 2. Settings → API: скопируйте Project URL и anon public key ЭТОГО проекта
-- 3. Вставьте их в index.html (SUPABASE_URL и SUPABASE_ANON_KEY)
--
-- Таблицы специально с префиксом inv_, чтобы не задеть остальные данные.

create extension if not exists pgcrypto;

create table if not exists inv_catalog_items (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('бар', 'кухня', 'кондитерская', 'зал')),
  code text not null default '',
  name text not null,
  unit text not null default 'шт',
  category text not null default 'Прочее',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inv_catalog_items_section_idx on inv_catalog_items (section);
create index if not exists inv_catalog_items_section_name_idx on inv_catalog_items (section, name);

create table if not exists inv_session_items (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  session_date date not null,
  item_id uuid not null references inv_catalog_items (id) on delete cascade,
  code text not null default '',
  name text not null,
  unit text not null default 'шт',
  total numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (section, session_date, item_id)
);

create index if not exists inv_session_items_lookup_idx on inv_session_items (section, session_date);

create table if not exists inv_visits (
  visit_date date primary key,
  count int not null default 0
);

create or replace function inv_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inv_catalog_items_updated_at on inv_catalog_items;
create trigger inv_catalog_items_updated_at
  before update on inv_catalog_items
  for each row execute procedure inv_set_updated_at();

drop trigger if exists inv_session_items_updated_at on inv_session_items;
create trigger inv_session_items_updated_at
  before update on inv_session_items
  for each row execute procedure inv_set_updated_at();

create or replace function inv_increment_visit()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (timezone('Asia/Yekaterinburg', now()))::date;
  today_count int;
  total_count int;
begin
  insert into inv_visits (visit_date, count)
  values (today, 1)
  on conflict (visit_date) do update
    set count = inv_visits.count + 1
  returning count into today_count;

  select coalesce(sum(count), 0) into total_count from inv_visits;
  return json_build_object('visits', total_count, 'today', today_count);
end;
$$;

alter table inv_catalog_items enable row level security;
alter table inv_session_items enable row level security;
alter table inv_visits enable row level security;

drop policy if exists inv_catalog_items_all on inv_catalog_items;
create policy inv_catalog_items_all on inv_catalog_items
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists inv_session_items_all on inv_session_items;
create policy inv_session_items_all on inv_session_items
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists inv_visits_all on inv_visits;
create policy inv_visits_all on inv_visits
  for all to anon, authenticated
  using (true) with check (true);

grant all on inv_catalog_items to anon, authenticated;
grant all on inv_session_items to anon, authenticated;
grant all on inv_visits to anon, authenticated;
grant execute on function inv_increment_visit() to anon, authenticated;
