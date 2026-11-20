-- One new boundary case only; full previous qualification is not replayed here.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.denied('personal foreign writer is denied by preauthorization',
 $$SELECT public.get_my_rtn_notifications('22222222-2222-4222-8222-222222222222')$$,'42501');
SET ROLE postgres;
