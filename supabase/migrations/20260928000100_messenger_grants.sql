-- 이 프로젝트는 새 테이블에 기본 GRANT가 없으므로 명시적으로 부여 (행 단위 제한은 RLS가 담당)
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select on public.rooms to authenticated;
grant select on public.room_members to authenticated;
grant select, insert on public.messages to authenticated;
