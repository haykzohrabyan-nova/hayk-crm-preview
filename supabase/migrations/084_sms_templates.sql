-- Admin-editable SMS / WhatsApp message templates (Twilio delivery).

create table if not exists public.sms_templates (
  template_key text primary key,
  body         text not null,
  updated_at   timestamptz not null default now()
);

alter table public.sms_templates enable row level security;

-- No authenticated policies — server uses service role; admin UI uses /api/admin/sms-templates.

insert into public.sms_templates (template_key, body) values
  ('quote_sent', 'Hi {firstName}, your quote from {companyName} is ready. Total: {total}. View & confirm: {link}'),
  ('order_sent', 'Hi {firstName}, your order from {companyName} is ready! Total: {total}. View details & payment: {link}'),
  ('payment_reminder', 'Hi {firstName}, your order {ref} from {companyName} is confirmed. Please pay {total} here: {link}'),
  ('invoice_link', 'Hi {firstName}, here is your order link for {ref} from {companyName}. View invoice & details: {link}'),
  ('invoice_link_in_production_paid', 'Hi {firstName}, your order {ref} from {companyName} is in production. View your invoice & status: {link}'),
  ('invoice_link_in_production_unpaid', 'Hi {firstName}, your order {ref} from {companyName} is in production. View invoice & pay online: {link}'),
  ('order_ready_pickup', 'Hi {firstName}, your order {ref} from {companyName} is ready for pickup!{pickupBlock}{phoneBlock} Details: {link}'),
  ('payment_confirmed_full_in_production', 'Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed — your order is paid in full. Track it here: {link}'),
  ('payment_confirmed_in_production', 'Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed — your order is now in production. Track it here: {link}'),
  ('payment_confirmed_full', 'Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed — paid in full. View your order: {link}'),
  ('payment_confirmed', 'Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed. View your order: {link}'),
  ('quote_follow_up', 'Hi {firstName}, friendly reminder about your quote {ref} from {companyName} ({total}). View & confirm: {link}'),
  ('quote_follow_up_no_total', 'Hi {firstName}, friendly reminder about your quote {ref} from {companyName}. View & confirm: {link}')
on conflict (template_key) do nothing;

drop trigger if exists set_sms_templates_updated_at on public.sms_templates;
create trigger set_sms_templates_updated_at
  before update on public.sms_templates
  for each row execute function public.set_updated_at();
