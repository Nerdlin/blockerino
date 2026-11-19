-- Pin the search_path of the plain (SECURITY INVOKER) helper and trigger functions in public.
-- The security advisor flagged 25 of them as "role mutable search_path". They cannot escalate privileges, but a pinned
-- path keeps them from resolving names through a schema a caller controls. SECURITY DEFINER functions already pin it.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f' and not p.prosecdef
      and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.fn);
  end loop;
end $$;
