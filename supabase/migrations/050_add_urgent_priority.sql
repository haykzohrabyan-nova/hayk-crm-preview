-- Add 'Urgent' to the ticket_priority lookup category
-- Also adds it to new-quote-form.tsx priority options via /api/lookups

insert into lookup_values (category, value, label, sort_order)
values ('ticket_priority', 'urgent', 'Urgent', 3)
on conflict (category, value) do nothing;
