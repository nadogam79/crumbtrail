-- 메신저: 프로필 / 친구(단방향) / 대화방(1:1, 단체) / 메시지
-- 방 생성·초대·나가기·자동 알림 발송은 RPC로만 가능하고, 클라이언트는 조회와 일반 메시지 전송만 직접 한다.

-- ── 프로필 ──────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{4,20}$'),
  name text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);

-- 가입 시 user_metadata의 handle/name으로 프로필 생성
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, handle, name)
  values (new.id, new.raw_user_meta_data ->> 'handle', new.raw_user_meta_data ->> 'name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 친구 (단방향) ───────────────────────────────────────
create table public.friendships (
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  is_emergency boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_id),
  check (owner_id <> friend_id)
);

-- ── 대화방 ──────────────────────────────────────────────
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null,
  name text check (name is null or char_length(name) between 1 and 40),
  -- 1:1방 중복 방지용: 두 user id를 정렬해 이은 값. 단체방은 null
  dm_key text unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (is_group = (dm_key is null))
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index room_members_user_idx on public.room_members (user_id);

-- ── 메시지 ──────────────────────────────────────────────
-- kind: text(일반), auto(지도 탭 자동 알림), system(초대/나가기 안내, sender 없음)
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  sender_id uuid default auth.uid() references public.profiles (id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'auto', 'system')),
  body text not null check (char_length(body) between 1 and 2000),
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create index messages_room_created_idx on public.messages (room_id, created_at);

-- ── RLS ────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;

-- room_members 정책에서 room_members를 다시 조회하면 재귀가 나므로 definer 함수로 우회
create function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

-- 아이디 검색을 위해 로그인 사용자는 모든 프로필의 handle/name 조회 가능
create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated using (true);

create policy "own friendships select" on public.friendships
  for select to authenticated using (owner_id = auth.uid());
create policy "own friendships insert" on public.friendships
  for insert to authenticated with check (owner_id = auth.uid());
create policy "own friendships update" on public.friendships
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own friendships delete" on public.friendships
  for delete to authenticated using (owner_id = auth.uid());

create policy "member rooms select" on public.rooms
  for select to authenticated using (public.is_room_member(id));

create policy "member room_members select" on public.room_members
  for select to authenticated using (public.is_room_member(room_id));

create policy "member messages select" on public.messages
  for select to authenticated using (public.is_room_member(room_id));
create policy "member text messages insert" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and kind = 'text' and public.is_room_member(room_id));

-- ── RPC ────────────────────────────────────────────────
-- 1:1방 조회 또는 생성. 내가 친구로 추가한 상대하고만 새로 열 수 있다.
create function public.get_or_create_dm(p_friend_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_room uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  v_key := least(v_me, p_friend_id)::text || ':' || greatest(v_me, p_friend_id)::text;
  select id into v_room from public.rooms where dm_key = v_key;
  if v_room is not null then return v_room; end if;

  if not exists (
    select 1 from public.friendships where owner_id = v_me and friend_id = p_friend_id
  ) then
    raise exception 'not a friend';
  end if;

  insert into public.rooms (is_group, dm_key, created_by)
  values (false, v_key, v_me)
  on conflict (dm_key) do nothing
  returning id into v_room;

  -- 동시 생성 경합으로 insert가 무시된 경우
  if v_room is null then
    select id into v_room from public.rooms where dm_key = v_key;
    return v_room;
  end if;

  insert into public.room_members (room_id, user_id)
  values (v_room, v_me), (v_room, p_friend_id);
  return v_room;
end;
$$;

-- 단체방 생성. 멤버는 내 친구 중에서만.
create function public.create_group_room(p_name text, p_member_ids uuid[])
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

-- 단체방 초대. 방 멤버가 자기 친구를 초대한다.
create function public.invite_to_room(p_room_id uuid, p_member_ids uuid[])
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

-- 단체방 나가기
create function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if not exists (select 1 from public.rooms where id = p_room_id and is_group) then
    raise exception 'not a group room';
  end if;
  delete from public.room_members where room_id = p_room_id and user_id = v_me;
  if not found then raise exception 'not a member'; end if;

  insert into public.messages (room_id, sender_id, kind, body)
  select p_room_id, null, 'system', name || '님이 나갔어요.'
  from public.profiles where id = v_me;
end;
$$;

-- 지도 탭 자동 알림: 비상 연락망 친구 각각의 1:1방에 발송. 받은 친구 수를 반환.
create function public.send_auto_alert(p_body text, p_lat double precision, p_lng double precision)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_friend uuid;
  v_count integer := 0;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  for v_friend in
    select friend_id from public.friendships where owner_id = v_me and is_emergency
  loop
    insert into public.messages (room_id, sender_id, kind, body, lat, lng)
    values (public.get_or_create_dm(v_friend), v_me, 'auto', p_body, p_lat, p_lng);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 대화방 목록: 방 정보 + 나를 제외한 멤버 이름 + 마지막 메시지
create function public.list_my_rooms()
returns table (
  id uuid,
  is_group boolean,
  name text,
  member_names text[],
  member_count integer,
  last_body text,
  last_kind text,
  last_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.is_group,
    r.name,
    coalesce(
      (select array_agg(p.name order by p.name)
       from public.room_members m join public.profiles p on p.id = m.user_id
       where m.room_id = r.id and m.user_id <> auth.uid()),
      '{}'
    ),
    (select count(*)::integer from public.room_members m where m.room_id = r.id),
    lm.body,
    lm.kind,
    lm.created_at
  from public.rooms r
  join public.room_members me on me.room_id = r.id and me.user_id = auth.uid()
  left join lateral (
    select body, kind, created_at from public.messages
    where room_id = r.id order by created_at desc limit 1
  ) lm on true
  order by coalesce(lm.created_at, r.created_at) desc;
$$;

revoke execute on function
  public.is_room_member(uuid),
  public.get_or_create_dm(uuid),
  public.create_group_room(text, uuid[]),
  public.invite_to_room(uuid, uuid[]),
  public.leave_room(uuid),
  public.send_auto_alert(text, double precision, double precision),
  public.list_my_rooms()
from public, anon;

grant execute on function
  public.is_room_member(uuid),
  public.get_or_create_dm(uuid),
  public.create_group_room(text, uuid[]),
  public.invite_to_room(uuid, uuid[]),
  public.leave_room(uuid),
  public.send_auto_alert(text, double precision, double precision),
  public.list_my_rooms()
to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
