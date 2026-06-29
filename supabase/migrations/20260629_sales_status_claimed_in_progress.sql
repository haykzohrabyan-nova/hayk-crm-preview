-- Sales pipeline status cleanup for Claimed / In Progress / Quote Sent / Pipeline tabs.
-- Rule: claim → Claimed only; rep must click In Progress manually; quote → Quote Sent.

-- 1. Unclaimed pool: legacy route set Ongoing without owner → Pipeline (null).
UPDATE leads
SET sales_status = NULL
WHERE status = 'Routed to Sales'
  AND sales_owner_id IS NULL
  AND sales_status = 'Ongoing';

-- 2. Assigned, no status yet → Claimed tab.
UPDATE leads
SET sales_status = 'Claimed'
WHERE status = 'Routed to Sales'
  AND sales_owner_id IS NOT NULL
  AND sales_status IS NULL;

-- 3. Legacy owned Ongoing → Claimed (NOT In Progress — rep must mark in progress manually).
UPDATE leads
SET sales_status = 'Claimed'
WHERE status = 'Routed to Sales'
  AND sales_owner_id IS NOT NULL
  AND sales_status = 'Ongoing';

-- 4. Undo mistaken In Progress from an earlier version of this migration (keep Quote Sent).
UPDATE leads
SET sales_status = 'Claimed'
WHERE status = 'Routed to Sales'
  AND sales_owner_id IS NOT NULL
  AND sales_status = 'In Progress';
