create extension if not exists pgmq;
create schema if not exists foundation_private;
revoke all on schema foundation_private from public, anon, authenticated;

do $$ begin
  if not exists (select from pg_roles where rolname = 'foundation_worker') then
    create role foundation_worker login noinherit;
  end if;
end $$;
grant usage on schema foundation_private to foundation_worker;

create table public.foundation_allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.foundation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  request_key uuid not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  lease_token uuid,
  lease_until timestamptz,
  object_key text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(owner_id,request_key),
  check ((lease_token is null) = (lease_until is null)),
  check ((status = 'running') = (lease_token is not null and lease_until is not null)),
  check ((status in ('succeeded','failed')) = (completed_at is not null)),
  check ((status = 'succeeded') = (object_key is not null)),
  check ((status = 'failed') = (error_code is not null))
);
create index foundation_jobs_owner_created on public.foundation_jobs(owner_id,created_at);
create index foundation_jobs_pending on public.foundation_jobs(status,lease_until) where status in ('queued','running');
alter table public.foundation_allowed_users enable row level security;
alter table public.foundation_jobs enable row level security;
select pgmq.create('foundation_demo');

-- The client and worker never mutate tables or call general queue primitives.
revoke all on public.foundation_allowed_users, public.foundation_jobs from public, anon, authenticated, foundation_worker;
revoke all on schema pgmq from public, anon, authenticated, foundation_worker;
revoke all on all tables in schema pgmq from public, anon, authenticated, foundation_worker;
revoke all on all sequences in schema pgmq from public, anon, authenticated, foundation_worker;
revoke execute on all functions in schema pgmq from public, anon, authenticated, foundation_worker;

do $$ begin
  if exists(select 1 from pg_namespace where nspname='pgmq_public') then
    execute 'revoke all on schema pgmq_public from public, anon, authenticated, foundation_worker';
    execute 'revoke execute on all functions in schema pgmq_public from public, anon, authenticated, foundation_worker';
  end if;
end $$;

create function foundation_private.message_job_id(p_message jsonb) returns uuid
language plpgsql immutable set search_path = '' as $$
begin return (p_message->>'job_id')::uuid;
exception when invalid_text_representation then return null;
end $$;

create function public.foundation_is_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.foundation_allowed_users where user_id = auth.uid()
  );
$$;
create policy foundation_own_jobs on public.foundation_jobs for select to authenticated
using (owner_id = (select auth.uid()) and (select public.foundation_is_allowed()));
grant select on public.foundation_jobs to authenticated;

create function public.foundation_create_job(p_request_key uuid)
returns table(id uuid, status text, created boolean)
language plpgsql security definer set search_path = '' as $$
declare v_job public.foundation_jobs; v_owner uuid := auth.uid();
begin
  if not public.foundation_is_allowed() then raise exception using errcode='42501', message='forbidden'; end if;
  if p_request_key is null then raise exception using errcode='22023', message='invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  select * into v_job from public.foundation_jobs j where j.owner_id=v_owner and j.request_key=p_request_key;
  if found then return query select v_job.id, v_job.status, false; return; end if;
  if exists(select 1 from public.foundation_jobs j where j.owner_id=v_owner and j.status in ('queued','running'))
    or (select count(*) from public.foundation_jobs j where j.owner_id=v_owner and j.created_at > now()-interval '1 hour') >= 10
  then raise exception using errcode='P0001', message='quota_exceeded'; end if;
  insert into public.foundation_jobs(owner_id,request_key) values(v_owner,p_request_key) returning * into v_job;
  perform pgmq.send('foundation_demo',jsonb_build_object('version',1,'job_id',v_job.id));
  return query select v_job.id,v_job.status,true;
end $$;

create function foundation_private.read_message()
returns table(msg_id bigint, message jsonb)
language sql security definer set search_path = '' as $$
  select msg_id,message from pgmq.read('foundation_demo',60,1);
$$;

-- Fetch the real message again by ID, do not trust caller supplied payloads.
create function foundation_private.claim_message(p_msg_id bigint)
returns table(job_id uuid, owner_id uuid, lease_token uuid, attempt integer, disposition text)
language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_id uuid; v_job public.foundation_jobs; v_error text;
begin
  select message into v_payload from pgmq.q_foundation_demo where msg_id=p_msg_id;
  if not found then return; end if;
  begin v_id := (v_payload->>'job_id')::uuid;
  exception when invalid_text_representation then v_id := null; end;
  select * into v_job from public.foundation_jobs where id=v_id for update;
  if not found then
    perform pgmq.archive('foundation_demo',p_msg_id);
    return query select null::uuid,null::uuid,null::uuid,0,'unidentifiable'::text; return;
  end if;
  if v_job.status in ('succeeded','failed') then
    perform pgmq.archive('foundation_demo',p_msg_id); return;
  end if;
  if v_job.lease_until > clock_timestamp() then return; end if;
  if jsonb_typeof(v_payload) <> 'object' or not (v_payload ? 'version') then v_error := 'invalid_message';
  elsif v_payload->'version' <> '1'::jsonb then v_error := 'unsupported_contract';
  elsif jsonb_typeof(v_payload->'job_id') <> 'string' or
    (select count(*) from jsonb_object_keys(v_payload)) <> 2 then v_error := 'invalid_message';
  elsif v_job.attempt_count >= 3 then v_error := 'attempts_exhausted'; end if;
  if v_error is not null then
    update public.foundation_jobs set status='failed',error_code=v_error,completed_at=clock_timestamp(),
      updated_at=clock_timestamp(),lease_token=null,lease_until=null where id=v_job.id;
    perform pgmq.archive('foundation_demo',p_msg_id);
    return query select v_job.id,v_job.owner_id,null::uuid,v_job.attempt_count,v_error; return;
  end if;
  update public.foundation_jobs set status='running',attempt_count=attempt_count+1,
    lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
    where id=v_job.id returning * into v_job;
  return query select v_job.id,v_job.owner_id,v_job.lease_token,v_job.attempt_count,'claimed'::text;
end $$;

create function foundation_private.complete_job(p_job_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.foundation_jobs set status='succeeded',
    object_key='foundation/' || owner_id::text || '/' || id::text || '/result.txt',
    completed_at=clock_timestamp(),updated_at=clock_timestamp(),lease_token=null,lease_until=null
    where id=p_job_id and status='running' and lease_token=p_lease_token and lease_until>clock_timestamp();
  return found;
end $$;
create function foundation_private.fail_attempt(p_job_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.foundation_jobs set status='queued',updated_at=clock_timestamp(),lease_token=null,lease_until=null
    where id=p_job_id and status='running' and lease_token=p_lease_token and lease_until>clock_timestamp();
  return found;
end $$;
create function foundation_private.archive_message(p_msg_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from pgmq.q_foundation_demo q join public.foundation_jobs j
    on foundation_private.message_job_id(q.message)=j.id where q.msg_id=p_msg_id and j.status in ('succeeded','failed')) then
    return pgmq.archive('foundation_demo',p_msg_id);
  end if;
  return false;
end $$;

-- Administration only: listing never modifies data. Invisible messages count as active.
create function foundation_private.orphan_candidates()
returns table(job_id uuid) language sql security definer set search_path = '' as $$
  select j.id from public.foundation_jobs j
  where j.status in ('queued','running') and (j.lease_until is null or j.lease_until<=clock_timestamp())
    and not exists(select 1 from pgmq.q_foundation_demo q where foundation_private.message_job_id(q.message)=j.id);
$$;
create function foundation_private.reconcile_orphan(p_job_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_job public.foundation_jobs;
begin
  select * into v_job from public.foundation_jobs where id=p_job_id for update;
  if not found or v_job.status not in ('queued','running') or v_job.lease_until>clock_timestamp() then return false; end if;
  if exists(select 1 from pgmq.q_foundation_demo q where foundation_private.message_job_id(q.message)=p_job_id) then return false; end if;
  update public.foundation_jobs set status='failed',error_code='orphaned_message',
    completed_at=clock_timestamp(),updated_at=clock_timestamp(),lease_token=null,lease_until=null where id=p_job_id;
  return true;
end $$;
create function foundation_private.purge_candidates()
returns table(job_id uuid, object_key text) language sql security definer set search_path = '' as $$
  select id,'foundation/' || owner_id::text || '/' || id::text || '/result.txt'
    from public.foundation_jobs where status in ('succeeded','failed') and completed_at < now()-interval '7 days';
$$;
create function foundation_private.purge_job(p_job_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_job public.foundation_jobs;
begin
  select * into v_job from public.foundation_jobs where id=p_job_id for update;
  if not found or v_job.status not in ('succeeded','failed') or v_job.completed_at >= now()-interval '7 days' then return false; end if;
  delete from pgmq.q_foundation_demo where foundation_private.message_job_id(message)=p_job_id;
  delete from pgmq.a_foundation_demo where foundation_private.message_job_id(message)=p_job_id;
  delete from public.foundation_jobs where id=p_job_id;
  return true;
end $$;

revoke execute on function public.foundation_is_allowed(),public.foundation_create_job(uuid) from public,anon,authenticated,foundation_worker;
grant execute on function public.foundation_is_allowed(),public.foundation_create_job(uuid) to authenticated;
revoke execute on all functions in schema foundation_private from public,anon,authenticated,foundation_worker;
grant execute on function foundation_private.read_message(),foundation_private.claim_message(bigint),
  foundation_private.complete_job(uuid,uuid),foundation_private.fail_attempt(uuid,uuid),
  foundation_private.archive_message(bigint) to foundation_worker;
-- Prevent future privileged functions from inheriting PostgreSQL's PUBLIC EXECUTE default.
alter default privileges in schema foundation_private revoke execute on functions from public;
