-- Staging hotfix: anon storage policy checks call is_platform_admin(), which must not error when anon lacks EXECUTE.
-- Access remains denied; only the error message is normalized for operators.
grant execute on function public.is_platform_admin(uuid) to anon;

notify pgrst, 'reload schema';