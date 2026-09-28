-- 기본 친구 '경찰': 모든 사용자에게 자동으로 추가되는 수신 전용 계정.
-- 비밀번호가 없어 로그인할 수 없으므로 경찰 쪽에서 메시지를 보낼 일은 없다.
-- 항상 비상 연락망(is_emergency)으로 고정되어 모든 자동 메시지를 받는다.

alter table public.profiles add column is_police boolean not null default false;

create function public.police_id()
returns uuid
language sql
immutable
as $$ select '00000000-0000-0000-0000-000000000112'::uuid $$;

grant execute on function public.police_id() to authenticated;

-- 가입 트리거: 프로필 생성 + 경찰 친구 자동 추가
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, handle, name, is_police)
  values (
    new.id,
    new.raw_user_meta_data ->> 'handle',
    new.raw_user_meta_data ->> 'name',
    new.id = public.police_id()
  );

  if new.id <> public.police_id() then
    insert into public.friendships (owner_id, friend_id, is_emergency)
    values (new.id, public.police_id(), true);
  end if;
  return new;
end;
$$;

-- 경찰 계정 생성 (encrypted_password가 없어 로그인 불가). 이메일을 선점해 police 아이디 가입도 막는다.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000000',
  public.police_id(),
  'authenticated',
  'authenticated',
  'police@crumbtrail.local',
  '',
  '{"provider": "email", "providers": ["email"]}',
  '{"handle": "police", "name": "경찰"}',
  now(),
  now()
);

-- 기존 사용자에게도 경찰 친구 추가
insert into public.friendships (owner_id, friend_id, is_emergency)
select id, public.police_id(), true
from public.profiles
where id <> public.police_id()
on conflict (owner_id, friend_id) do update set is_emergency = true;

-- 경찰 친구는 삭제하거나 비상 연락망에서 뺄 수 없다
drop policy "own friendships update" on public.friendships;
create policy "own friendships update" on public.friendships
  for update to authenticated
  using (owner_id = auth.uid() and friend_id <> public.police_id())
  with check (owner_id = auth.uid());

drop policy "own friendships delete" on public.friendships;
create policy "own friendships delete" on public.friendships
  for delete to authenticated
  using (owner_id = auth.uid() and friend_id <> public.police_id());

-- 단체방 생성/초대에서 경찰 제외
create or replace function public.create_group_room(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_room uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if coalesce(array_length(p_member_ids, 1), 0) = 0 then raise exception 'no members'; end if;
  if public.police_id() = any (p_member_ids) then raise exception 'police cannot join group rooms'; end if;
  if exists (
    select 1 from unnest(p_member_ids) m(id)
    where not exists (select 1 from public.friendships where owner_id = v_me and friend_id = m.id)
  ) then
    raise exception 'members must be friends';
  end if;

  insert into public.rooms (is_group, name, created_by)
  values (true, nullif(trim(p_name), ''), v_me)
  returning id into v_room;

  insert into public.room_members (room_id, user_id)
  select v_room, id from unnest(array_append(p_member_ids, v_me)) u(id)
  on conflict do nothing;
  return v_room;
end;
$$;

create or replace function public.invite_to_room(p_room_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_names text;
begin
  if not public.is_room_member(p_room_id) then raise exception 'not a member'; end if;
  if not exists (select 1 from public.rooms where id = p_room_id and is_group) then
    raise exception 'not a group room';
  end if;
  if public.police_id() = any (p_member_ids) then raise exception 'police cannot join group rooms'; end if;
  if exists (
    select 1 from unnest(p_member_ids) m(id)
    where not exists (select 1 from public.friendships where owner_id = v_me and friend_id = m.id)
  ) then
    raise exception 'members must be friends';
  end if;

  with added as (
    insert into public.room_members (room_id, user_id)
    select p_room_id, id from unnest(p_member_ids) u(id)
    on conflict do nothing
    returning user_id
  )
  select string_agg(p.name, ', ') into v_names
  from added a join public.profiles p on p.id = a.user_id;

  if v_names is not null then
    insert into public.messages (room_id, sender_id, kind, body)
    select p_room_id, null, 'system', name || '님이 ' || v_names || '님을 초대했어요.'
    from public.profiles where id = v_me;
  end if;
end;
$$;
