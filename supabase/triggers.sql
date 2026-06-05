-- Supabase auth-schema objects that Prisma does NOT manage.
--
-- ⚠️ RE-APPLY THIS AFTER ANY DESTRUCTIVE `prisma db push` that recreates the
-- `profiles` table. A push that drops/recreates `profiles` silently removes
-- `profiles_id_fkey` and orphans the trigger, so new signups stop getting a
-- profiles row. Run this file again (Supabase SQL editor, or the Supabase MCP
-- `apply_migration`) whenever you reset the schema.
--
-- Order: run AFTER `prisma db push` (the public.profiles table + UserRole enum
-- must already exist).

-- Mirror every new auth.users row into public.profiles. Role + name come from
-- raw_user_meta_data set at signup (data: { role, name | firstName/lastName }).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, image, "createdAt", "updatedAt")
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      nullif(trim(concat_ws(' ', new.raw_user_meta_data->>'firstName', new.raw_user_meta_data->>'lastName')), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public."UserRole", 'MERCHANT'),
    new.raw_user_meta_data->>'avatar_url',
    now(),
    now()
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Deleting an auth user cascades to its profile (and onward via app FKs).
-- Guarded so re-running this file is idempotent.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end$$;

-- VKT-Bougie read-only role (catalog reads). Set <password> before running, or
-- manage it separately. Idempotent.
-- do $$
-- begin
--   if not exists (select 1 from pg_roles where rolname = 'vktbougie_reader') then
--     create role vktbougie_reader with login password '<password>';
--   end if;
-- end$$;
-- grant usage on schema public to vktbougie_reader;
-- grant select on all tables in schema public to vktbougie_reader;
-- alter default privileges in schema public grant select on tables to vktbougie_reader;
