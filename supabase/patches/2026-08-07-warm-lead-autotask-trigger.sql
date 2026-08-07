-- Durable auto-task for NEW warm leads (azat schema).
--
-- WHY: azat.crm_ingest_lead auto-assigns a warm lead to a company's deal owner
-- (status 'warm_lead', owner set). The /api/leads/ingest route creates a +24h
-- follow-up task for those, but a warm lead can also be born OUTSIDE that route
-- (a webhook, a manual INSERT, a future integration). This trigger guarantees
-- EVERY new owned lead gets exactly one open follow-up task, no matter how it
-- was created — the route then simply adopts the trigger's task (idempotent).
--
-- SAFETY:
--   * AFTER INSERT only  -> the 299 pre-existing leads are never touched.
--   * owner_id IS NOT NULL guard -> team-queue leads (no owner) get nothing here;
--     they already surface in the Inbox to be claimed.
--   * "no open follow-up task exists" guard -> never creates a duplicate, so it
--     is safe to re-run and coexists with the route's own ensure-task logic.
--   * kind = 'followup' (distinct from the 'first_touch' task crm_ingest_lead
--     already writes) so the two never collide.

-- ─────────────────────────────────────────────────────────────────────────────
-- PRE-EXISTING BUG FIX (root cause — required for the RPC to create ANY lead).
--
-- azat.crm_chain_task() (the AFTER INSERT trigger on azat.tasks that auto-closes a
-- lead/deal's other open tasks) references the table UNQUALIFIED: `update tasks`.
-- azat.crm_ingest_lead runs with `SET search_path = public`, and there is no
-- public.tasks — so the RPC's own `first_touch` task insert (and now any auto-task
-- insert) raised: relation "tasks" does not exist, blocking every new-lead ingest.
-- Under the normal PostgREST search_path this already resolved to azat.tasks; we
-- simply schema-qualify it so it is correct under ALL search paths. Pure bugfix,
-- no behavior change.
create or replace function azat.crm_chain_task()
returns trigger
language plpgsql
as $$
begin
  update azat.tasks set done_at = now()
   where done_at is null and id <> new.id
     and ( (new.lead_id is not null and lead_id = new.lead_id)
        or (new.deal_id is not null and deal_id = new.deal_id) );
  return new;
end $$;

create or replace function azat.crm_autotask_new_warm_lead()
returns trigger
language plpgsql
-- Resolve any unqualified name in nested trigger functions against azat first.
set search_path = azat, public
as $$
declare
  v_who text;
begin
  if new.owner_id is not null
     and not exists (
       select 1
         from azat.tasks t
        where t.lead_id = new.id
          and t.kind = 'followup'
          and t.done_at is null
     )
  then
    -- Best-effort human label: contact name, else company name.
    select coalesce(nullif(trim(c.name), ''), nullif(trim(o.name), ''))
      into v_who
      from (select 1) s
      left join azat.contacts c      on c.id = new.contact_id
      left join azat.organizations o on o.id = new.organization_id;

    insert into azat.tasks (lead_id, contact_id, owner_id, kind, label, due_at)
    values (
      new.id,
      new.contact_id,
      new.owner_id,
      'followup',
      'Follow up new lead' || case when v_who is not null then ' — ' || v_who else '' end,
      now() + interval '24 hours'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists leads_autotask_new_warm_lead on azat.leads;
create trigger leads_autotask_new_warm_lead
  after insert on azat.leads
  for each row
  execute function azat.crm_autotask_new_warm_lead();
