-- GoTrue는 auth.users의 토큰 컬럼이 NULL이면 행을 읽지 못해 "Database error querying schema"를 낸다.
-- SQL로 직접 넣은 경찰 계정의 해당 컬럼을 빈 문자열로 채운다.
-- 또 미인증 상태로 두면 police 이메일 가입 요청이 거부되지 않고 그 계정을 인증 처리해버리므로 인증됨으로 둔다.
update auth.users
set
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  email_change = coalesce(email_change, ''),
  reauthentication_token = coalesce(reauthentication_token, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, '')
where id = public.police_id();
