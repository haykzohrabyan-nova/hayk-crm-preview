// Hayk 2026-07-01 — Preview inbox seed data.
// Realistic Bazaar Printing comm history — calls, SMS, emails, IG DMs, web forms.
// Every item carries a mock AI summary + action items.
// No real integrations here; this is scripted UI content only.

export type Channel = "call" | "sms" | "email" | "ig" | "web_form";

export interface CallTranscriptLine {
  who: "agent" | "customer";
  name: string;
  timestamp: string; // "00:12"
  text: string;
}

export interface CallBody {
  kind: "call";
  direction: "inbound" | "outbound";
  durationSec: number;
  recordingUrl?: string;
  transcript: CallTranscriptLine[];
}

export interface SmsMessage {
  from: "customer" | "rep";
  name: string;
  at: string; // "10:14 AM"
  text: string;
}

export interface SmsBody {
  kind: "sms";
  thread: SmsMessage[];
}

export interface EmailMessage {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  at: string; // "Jun 30, 11:42 AM"
  body: string;
}

export interface EmailBody {
  kind: "email";
  subject: string;
  chain: EmailMessage[];
}

export interface IgMessage {
  from: "customer" | "rep";
  name: string;
  handle: string;
  at: string;
  text: string;
}

export interface IgBody {
  kind: "ig";
  thread: IgMessage[];
}

export interface WebFormField {
  label: string;
  value: string;
}

export interface WebFormBody {
  kind: "web_form";
  formName: string;
  fields: WebFormField[];
  attachments?: { name: string; size: string }[];
}

export type CommBody = CallBody | SmsBody | EmailBody | IgBody | WebFormBody;

export interface CommItem {
  id: string;
  channel: Channel;
  customerName: string;
  customerCompany?: string;
  contact: string; // phone / email / @handle
  assignedTo: string;
  linkedTo: {
    kind: "lead" | "customer" | "order" | "quote" | "unmatched";
    ref: string;
    label: string;
    href?: string;
  };
  receivedAt: string; // relative — "17m ago"
  receivedAtISO: string;
  unread: boolean;
  flagged?: boolean; // action needed
  aiSummary: string;
  aiActionItems: string[];
  aiSummarizedAt: string; // "Jun 30, 2:15 PM"
  body: CommBody;
}

// ─────────────────────────────────────────────────────────
// Seeds
// ─────────────────────────────────────────────────────────

export const COMM_ITEMS: CommItem[] = [
  // ─── CALLS (6) ─────────────────────────────────────────
  {
    id: "C-001",
    channel: "call",
    customerName: "Boris Boris",
    customerCompany: "BoyBoy LLC",
    contact: "+1 (818) 555-0142",
    assignedTo: "Marianna",
    linkedTo: { kind: "order", ref: "ORD-111", label: "Order #0111" },
    receivedAt: "17m ago",
    receivedAtISO: "2026-07-01T14:12:00Z",
    unread: true,
    flagged: true,
    aiSummary:
      "Boris asking when Body Lotion Box order (ORD-111) will ship. Confirmed shipping window is Jul 3–5. Wants tracking as soon as it's out.",
    aiActionItems: [
      "Send tracking number when shipped",
      "Confirm delivery address is Warehouse B",
    ],
    aiSummarizedAt: "Jul 1, 2:14 PM",
    body: {
      kind: "call",
      direction: "inbound",
      durationSec: 742,
      transcript: [
        { who: "agent", name: "Marianna", timestamp: "00:03", text: "Bazaar Printing, this is Marianna, how can I help?" },
        { who: "customer", name: "Boris", timestamp: "00:07", text: "Hey Marianna, it's Boris — the body lotion boxes, order 0111. Just checking on ship date." },
        { who: "agent", name: "Marianna", timestamp: "00:14", text: "One sec, let me pull it up. Yeah — 0111 is on Machine 4 right now, die-cut is scheduled tomorrow morning." },
        { who: "customer", name: "Boris", timestamp: "00:22", text: "Okay cool. So Friday realistically?" },
        { who: "agent", name: "Marianna", timestamp: "00:26", text: "Friday to Monday for shipping. We're saying Jul 3 to Jul 5 to give ourselves a cushion, but I'd bet on Friday." },
        { who: "customer", name: "Boris", timestamp: "00:35", text: "Perfect. Can you shoot me the tracking as soon as it goes out? I need it for my warehouse guys." },
        { who: "agent", name: "Marianna", timestamp: "00:42", text: "Absolutely. Same email and phone? And is it still the Warehouse B address in Chatsworth?" },
        { who: "customer", name: "Boris", timestamp: "00:50", text: "Yeah, Warehouse B — the one on Nordhoff. Text me the tracking, don't email." },
        { who: "agent", name: "Marianna", timestamp: "00:56", text: "Got it, texting. I'll flag your file so it gets sent the moment it ships." },
        { who: "customer", name: "Boris", timestamp: "01:03", text: "You guys are killing it with the finish on these boxes, by the way. My client already asked who prints them." },
        { who: "agent", name: "Marianna", timestamp: "01:10", text: "Oh that's amazing to hear — I'll pass it to Hayk. Send that client our way anytime." },
        { who: "customer", name: "Boris", timestamp: "01:17", text: "Will do. Also, when we hit the reorder, can we look at swapping to soft-touch lam?" },
        { who: "agent", name: "Marianna", timestamp: "01:24", text: "Yes, I'll note it. Soft-touch on the lotion boxes for the next run. We can send a quote comparison so you see the price bump." },
        { who: "customer", name: "Boris", timestamp: "01:31", text: "Cool. Reorder is probably 4–6 weeks out." },
        { who: "agent", name: "Marianna", timestamp: "01:36", text: "I'll ping you around week 3. Anything else?" },
        { who: "customer", name: "Boris", timestamp: "01:42", text: "Nope, that's it. Thanks Marianna." },
        { who: "agent", name: "Marianna", timestamp: "01:45", text: "Talk soon, Boris." },
      ],
    },
  },
  {
    id: "C-002",
    channel: "call",
    customerName: "Nicole Han",
    contact: "+1 (213) 555-0219",
    assignedTo: "Marianna",
    linkedTo: { kind: "lead", ref: "L003", label: "Lead L003" },
    receivedAt: "2h ago",
    receivedAtISO: "2026-07-01T12:30:00Z",
    unread: false,
    flagged: true,
    aiSummary:
      "Nicole needs 300 rush hoodies with DTG print for a music festival Jul 12. Budget flexible. Asked about turnaround and needs a written quote today.",
    aiActionItems: [
      "Send rush quote by end of day",
      "Confirm hoodie stock in adult sizes S–XXL",
      "Book art review slot for tomorrow AM",
    ],
    aiSummarizedAt: "Jul 1, 12:38 PM",
    body: {
      kind: "call",
      direction: "inbound",
      durationSec: 428,
      transcript: [
        { who: "agent", name: "Marianna", timestamp: "00:02", text: "Bazaar Printing, this is Marianna." },
        { who: "customer", name: "Nicole", timestamp: "00:05", text: "Hi, I found you guys through your Instagram. I need hoodies fast — festival on the 12th." },
        { who: "agent", name: "Marianna", timestamp: "00:11", text: "Sure, let's see what we can do. How many, and do you have artwork ready?" },
        { who: "customer", name: "Nicole", timestamp: "00:17", text: "300 hoodies. Yeah I have art — one location front, small logo left chest." },
        { who: "agent", name: "Marianna", timestamp: "00:25", text: "Okay, and blank type? Independent, Champion, private label?" },
        { who: "customer", name: "Nicole", timestamp: "00:32", text: "Something premium but not crazy. Suggest something." },
        { who: "agent", name: "Marianna", timestamp: "00:38", text: "Independent SS4500 is our workhorse — heavyweight, holds print well. I can do 300 of those DTG in about 5 business days." },
        { who: "customer", name: "Nicole", timestamp: "00:47", text: "5 days for 300? That leaves me a buffer, good. What's the damage?" },
        { who: "agent", name: "Marianna", timestamp: "00:52", text: "I'll build the quote now. Ballpark is $32–36 landed per hoodie in that size range. I'll email you an exact number in the next couple hours." },
        { who: "customer", name: "Nicole", timestamp: "01:04", text: "Perfect. And you can do art review tomorrow? I want to make sure the file's clean before we print anything." },
        { who: "agent", name: "Marianna", timestamp: "01:12", text: "Yes, I'll book you in for 10 AM tomorrow. I'll send a calendar invite with the quote." },
        { who: "customer", name: "Nicole", timestamp: "01:20", text: "You're a lifesaver. Talk tomorrow." },
        { who: "agent", name: "Marianna", timestamp: "01:23", text: "Talk soon Nicole. Bye." },
      ],
    },
  },
  {
    id: "C-003",
    channel: "call",
    customerName: "Grim Lawd",
    customerCompany: "Grimeylyfe Records",
    contact: "+1 (323) 555-0177",
    assignedTo: "Hayk",
    linkedTo: { kind: "lead", ref: "L001", label: "Lead L001" },
    receivedAt: "5h ago",
    receivedAtISO: "2026-07-01T09:22:00Z",
    unread: false,
    aiSummary:
      "Grim wants to walk through the quote before signing. Concerned about the Pantone match on the metallic gold — asked to see a physical proof.",
    aiActionItems: [
      "Ship physical proof of metallic gold Pantone",
      "Send updated quote with proof cost line item",
    ],
    aiSummarizedAt: "Jul 1, 9:29 AM",
    body: {
      kind: "call",
      direction: "outbound",
      durationSec: 615,
      transcript: [
        { who: "agent", name: "Hayk", timestamp: "00:02", text: "Grim! Hayk from Bazaar." },
        { who: "customer", name: "Grim", timestamp: "00:05", text: "What's up brother." },
        { who: "agent", name: "Hayk", timestamp: "00:08", text: "Circling back on the mailer quote — anything blocking the go-ahead?" },
        { who: "customer", name: "Grim", timestamp: "00:14", text: "The gold. I need it to match my logo exact. I've been burned before." },
        { who: "agent", name: "Hayk", timestamp: "00:20", text: "Say no more. I'll ship you a physical proof this week — pressed on your actual stock so you see the metallic pop." },
        { who: "customer", name: "Grim", timestamp: "00:29", text: "How much extra?" },
        { who: "agent", name: "Hayk", timestamp: "00:31", text: "$85 for the proof, credited back if you sign the order." },
        { who: "customer", name: "Grim", timestamp: "00:38", text: "That's fair. Do it." },
        { who: "agent", name: "Hayk", timestamp: "00:41", text: "I'll send the updated quote with the proof line and a shipping ETA today." },
        { who: "customer", name: "Grim", timestamp: "00:48", text: "Appreciate you, Hayk. This is why I keep coming back." },
        { who: "agent", name: "Hayk", timestamp: "00:52", text: "That's the goal. Talk soon." },
      ],
    },
  },
  {
    id: "C-004",
    channel: "call",
    customerName: "SafeCare Packaging",
    customerCompany: "SafeCare Packaging",
    contact: "+1 (818) 555-0333",
    assignedTo: "Marianna",
    linkedTo: { kind: "order", ref: "ORD-114", label: "Order #0114" },
    receivedAt: "1d ago",
    receivedAtISO: "2026-06-30T18:40:00Z",
    unread: false,
    flagged: true,
    aiSummary:
      "SafeCare's ops manager pushing back on invoice — says they were quoted 500 but billed for 512. Wants a credit note by Wednesday.",
    aiActionItems: [
      "Reconcile 500 vs 512 quantity on ORD-114",
      "Issue credit note if overrun was internal",
    ],
    aiSummarizedAt: "Jun 30, 6:48 PM",
    body: {
      kind: "call",
      direction: "inbound",
      durationSec: 356,
      transcript: [
        { who: "agent", name: "Marianna", timestamp: "00:02", text: "Bazaar Printing, Marianna speaking." },
        { who: "customer", name: "SafeCare Ops (Denise)", timestamp: "00:06", text: "Hi Marianna, this is Denise from SafeCare. Question on the last invoice." },
        { who: "agent", name: "Marianna", timestamp: "00:11", text: "Sure, what's the concern?" },
        { who: "customer", name: "SafeCare Ops (Denise)", timestamp: "00:15", text: "The PO was for 500 units, but we got billed for 512. That's news to us." },
        { who: "agent", name: "Marianna", timestamp: "00:22", text: "You're right, that's on us. Standard overrun is 2%, but we should have flagged it before billing. Let me check the run report." },
        { who: "customer", name: "SafeCare Ops (Denise)", timestamp: "00:33", text: "We only take exactly what the PO says. The extra 12 sit here." },
        { who: "agent", name: "Marianna", timestamp: "00:40", text: "Understood. I'll issue a credit note for the 12 units — you can keep the extras as free samples. Can I get it to you by Wednesday?" },
        { who: "customer", name: "SafeCare Ops (Denise)", timestamp: "00:50", text: "Wednesday works. Thank you for owning it, appreciate that." },
        { who: "agent", name: "Marianna", timestamp: "00:55", text: "Of course. Sending the CN today, you'll see it hit by end of week." },
      ],
    },
  },
  {
    id: "C-005",
    channel: "call",
    customerName: "Amazi Amazi",
    customerCompany: "Amazi Labels",
    contact: "+1 (310) 555-0288",
    assignedTo: "Marianna",
    linkedTo: { kind: "order", ref: "ORD-119", label: "Order #0119" },
    receivedAt: "1d ago",
    receivedAtISO: "2026-06-30T15:15:00Z",
    unread: false,
    aiSummary:
      "Amazi confirming Pantone 2726 C for jar labels. Wants to see a wet proof before greenlighting the full run of 4,500 labels.",
    aiActionItems: [
      "Send wet proof of PMS 2726 C on chosen substrate",
      "Hold press schedule until Amazi signs off",
    ],
    aiSummarizedAt: "Jun 30, 3:22 PM",
    body: {
      kind: "call",
      direction: "inbound",
      durationSec: 512,
      transcript: [
        { who: "agent", name: "Marianna", timestamp: "00:02", text: "Bazaar, this is Marianna." },
        { who: "customer", name: "Amazi", timestamp: "00:04", text: "Hi hon, it's Amazi. About the labels — I want PMS 2726 C, not the coated version." },
        { who: "agent", name: "Marianna", timestamp: "00:12", text: "Got it, 2726 C. On the matte white BOPP, right?" },
        { who: "customer", name: "Amazi", timestamp: "00:18", text: "Yes but I want to see a wet proof first. Last time the blue came out too dark." },
        { who: "agent", name: "Marianna", timestamp: "00:26", text: "Totally fair. I'll run a wet proof this week and courier it to you." },
        { who: "customer", name: "Amazi", timestamp: "00:33", text: "Perfect. Don't schedule the press run yet, right?" },
        { who: "agent", name: "Marianna", timestamp: "00:38", text: "Holding it. Nothing goes on press until you sign off on the wet proof." },
        { who: "customer", name: "Amazi", timestamp: "00:44", text: "Ok love, thanks." },
      ],
    },
  },
  {
    id: "C-006",
    channel: "call",
    customerName: "Prime Cannabis",
    customerCompany: "Prime Cannabis Co.",
    contact: "+1 (424) 555-0466",
    assignedTo: "Hayk",
    linkedTo: { kind: "customer", ref: "CUST-PRIME", label: "Customer" },
    receivedAt: "2d ago",
    receivedAtISO: "2026-06-29T16:00:00Z",
    unread: false,
    flagged: true,
    aiSummary:
      "Hayk chasing overdue $8,420 invoice. Prime's finance lead says wire went out Monday — sending confirmation. Asked to pause any new work until cleared.",
    aiActionItems: [
      "Match incoming wire to Prime's overdue invoice",
      "Resume production on ORD-122 once cleared",
    ],
    aiSummarizedAt: "Jun 29, 4:11 PM",
    body: {
      kind: "call",
      direction: "outbound",
      durationSec: 292,
      transcript: [
        { who: "agent", name: "Hayk", timestamp: "00:02", text: "Hey Miguel, Hayk from Bazaar." },
        { who: "customer", name: "Miguel (Prime Finance)", timestamp: "00:05", text: "Hayk — I know, I know, the invoice." },
        { who: "agent", name: "Hayk", timestamp: "00:09", text: "Just need to know when it's landing so I don't stall your next run." },
        { who: "customer", name: "Miguel (Prime Finance)", timestamp: "00:14", text: "Wire went out Monday. I'll email you the confirmation as soon as I hang up." },
        { who: "agent", name: "Hayk", timestamp: "00:20", text: "Perfect. Once we see it we're rolling on ORD-122 again." },
        { who: "customer", name: "Miguel (Prime Finance)", timestamp: "00:26", text: "Appreciate the patience. Won't happen again." },
      ],
    },
  },

  // ─── SMS (6) ─────────────────────────────────────────
  {
    id: "S-001",
    channel: "sms",
    customerName: "Grim Lawd",
    customerCompany: "Grimeylyfe Records",
    contact: "+1 (323) 555-0177",
    assignedTo: "Hayk",
    linkedTo: { kind: "lead", ref: "L001", label: "Lead L001" },
    receivedAt: "22m ago",
    receivedAtISO: "2026-07-01T14:08:00Z",
    unread: true,
    flagged: true,
    aiSummary:
      "Grim confirming address for physical proof shipment. Wants Hayk to add UV spot varnish to the quote as an option before he signs.",
    aiActionItems: [
      "Update quote with UV spot varnish option",
      "Ship proof to confirmed studio address",
    ],
    aiSummarizedAt: "Jul 1, 2:12 PM",
    body: {
      kind: "sms",
      thread: [
        { from: "customer", name: "Grim", at: "1:52 PM", text: "yo hayk you got the studio address for the proof?" },
        { from: "rep", name: "Hayk", at: "1:54 PM", text: "Same one as last time? 4820 Melrose, ste 4?" },
        { from: "customer", name: "Grim", at: "1:56 PM", text: "yeah that one. also can u add spot uv to the quote as an option" },
        { from: "rep", name: "Hayk", at: "2:00 PM", text: "Yes. Sending updated quote in a few. Spot UV adds ~$180 across the run." },
        { from: "customer", name: "Grim", at: "2:02 PM", text: "cool" },
        { from: "customer", name: "Grim", at: "2:08 PM", text: "when does the proof land" },
      ],
    },
  },
  {
    id: "S-002",
    channel: "sms",
    customerName: "Ivy Bloom",
    contact: "+1 (562) 555-0910",
    assignedTo: "Marianna",
    linkedTo: { kind: "lead", ref: "L007", label: "Lead L007" },
    receivedAt: "3h ago",
    receivedAtISO: "2026-07-01T11:15:00Z",
    unread: true,
    aiSummary:
      "Ivy switched from IG to SMS after Marianna replied. Wants to see photos of previous stand-up pouch jobs Bazaar has produced.",
    aiActionItems: [
      "Send 3–4 pouch samples from portfolio",
      "Follow up with quote when specs firmed up",
    ],
    aiSummarizedAt: "Jul 1, 11:20 AM",
    body: {
      kind: "sms",
      thread: [
        { from: "customer", name: "Ivy", at: "10:58 AM", text: "hi is this bazaar? im ivy from ig" },
        { from: "rep", name: "Marianna", at: "11:02 AM", text: "Hi Ivy! Yes it is. Thanks for reaching out — got your DM earlier." },
        { from: "customer", name: "Ivy", at: "11:05 AM", text: "cool. can you send me pics of pouches you've made? i want to see finish quality" },
        { from: "rep", name: "Marianna", at: "11:08 AM", text: "Absolutely. What finish are you leaning toward — matte, gloss, soft-touch?" },
        { from: "customer", name: "Ivy", at: "11:11 AM", text: "matte with maybe a small foil accent" },
        { from: "rep", name: "Marianna", at: "11:14 AM", text: "Perfect. Sending 4 examples right now — that combo is one of our favorites." },
      ],
    },
  },
  {
    id: "S-003",
    channel: "sms",
    customerName: "Lena Park",
    customerCompany: "Hearth Bread",
    contact: "+1 (626) 555-0455",
    assignedTo: "Marianna",
    linkedTo: { kind: "order", ref: "ORD-121", label: "Order #0121" },
    receivedAt: "6h ago",
    receivedAtISO: "2026-07-01T08:44:00Z",
    unread: false,
    aiSummary:
      "Lena confirmed final artwork upload for bread bags. Rush deadline Jul 5 acknowledged. Asked if pickup is possible instead of shipping.",
    aiActionItems: [
      "Confirm pickup slot on Jul 5",
      "Notify shipping team to skip label creation",
    ],
    aiSummarizedAt: "Jul 1, 8:50 AM",
    body: {
      kind: "sms",
      thread: [
        { from: "customer", name: "Lena", at: "8:28 AM", text: "Just uploaded final art for bread bag rush order 0121, please confirm you got it" },
        { from: "rep", name: "Marianna", at: "8:33 AM", text: "Got it, previewing now. Looks clean 👍" },
        { from: "customer", name: "Lena", at: "8:36 AM", text: "Great. Can I do pickup instead of ship? Saves me a day" },
        { from: "rep", name: "Marianna", at: "8:41 AM", text: "Yes — pickup is fine. What time on the 5th works for you?" },
        { from: "customer", name: "Lena", at: "8:43 AM", text: "Between 2 and 4 PM ideally" },
        { from: "rep", name: "Marianna", at: "8:44 AM", text: "Booked. See you then." },
      ],
    },
  },
  {
    id: "S-004",
    channel: "sms",
    customerName: "Rise Botanicals",
    customerCompany: "Rise Botanicals",
    contact: "+1 (818) 555-0512",
    assignedTo: "Hayk",
    linkedTo: { kind: "customer", ref: "CUST-RISE", label: "Customer" },
    receivedAt: "1d ago",
    receivedAtISO: "2026-06-30T20:11:00Z",
    unread: false,
    flagged: true,
    aiSummary:
      "Rise is $1,780 past due on net-terms invoice. Owner promised to send ACH by Wednesday. Wants to discuss extending net terms from 15 to 30 days.",
    aiActionItems: [
      "Follow up Wed if ACH doesn't hit",
      "Draft net-30 terms proposal for review",
    ],
    aiSummarizedAt: "Jun 30, 8:18 PM",
    body: {
      kind: "sms",
      thread: [
        { from: "rep", name: "Hayk", at: "6:02 PM", text: "Hey Sam, quick nudge on the last invoice — 6 days past due" },
        { from: "customer", name: "Sam (Rise)", at: "7:45 PM", text: "Hey Hayk sorry — cash flow month. ACH going out Wednesday" },
        { from: "rep", name: "Hayk", at: "7:50 PM", text: "Appreciated. Let me know when it's sent." },
        { from: "customer", name: "Sam (Rise)", at: "8:03 PM", text: "Also can we talk moving to net 30? Would help a lot" },
        { from: "rep", name: "Hayk", at: "8:11 PM", text: "Can discuss — let's set up a call after this invoice clears" },
      ],
    },
  },
  {
    id: "S-005",
    channel: "sms",
    customerName: "Boris Boris",
    customerCompany: "BoyBoy LLC",
    contact: "+1 (818) 555-0142",
    assignedTo: "Marianna",
    linkedTo: { kind: "order", ref: "ORD-111", label: "Order #0111" },
    receivedAt: "1d ago",
    receivedAtISO: "2026-06-30T13:22:00Z",
    unread: false,
    aiSummary:
      "Boris asking whether soft-touch lamination changes ship date. Marianna confirmed no change if decided before Wednesday.",
    aiActionItems: [],
    aiSummarizedAt: "Jun 30, 1:30 PM",
    body: {
      kind: "sms",
      thread: [
        { from: "customer", name: "Boris", at: "12:58 PM", text: "does adding soft touch push the ship date" },
        { from: "rep", name: "Marianna", at: "1:04 PM", text: "If decided by Wed, no. After Wed adds ~2 days" },
        { from: "customer", name: "Boris", at: "1:12 PM", text: "ok ill decide by tomorrow" },
        { from: "rep", name: "Marianna", at: "1:14 PM", text: "Cool, standing by" },
      ],
    },
  },
  {
    id: "S-006",
    channel: "sms",
    customerName: "Vick May Day",
    contact: "+1 (747) 555-0771",
    assignedTo: "Marianna",
    linkedTo: { kind: "lead", ref: "L004", label: "Lead L004" },
    receivedAt: "2d ago",
    receivedAtISO: "2026-06-29T17:44:00Z",
    unread: false,
    aiSummary:
      "Vick following up on custom label quote. Says budget just cleared — ready to move forward on 2,000 units.",
    aiActionItems: [
      "Convert Lead L004 to quote and send today",
    ],
    aiSummarizedAt: "Jun 29, 5:50 PM",
    body: {
      kind: "sms",
      thread: [
        { from: "customer", name: "Vick", at: "5:30 PM", text: "hey — my client just approved budget. can we do those 2k labels" },
        { from: "rep", name: "Marianna", at: "5:36 PM", text: "Amazing! Sending the formal quote in a bit — turnaround stays 6 business days" },
        { from: "customer", name: "Vick", at: "5:42 PM", text: "sweet, appreciate you" },
      ],
    },
  },

  // ─── EMAILS (8) ─────────────────────────────────────────
  {
    id: "E-001",
    channel: "email",
    customerName: "Amazi Amazi",
    customerCompany: "Amazi Labels",
    contact: "amazi@amazilabels.com",
    assignedTo: "Marianna",
    linkedTo: { kind: "order", ref: "ORD-119", label: "Order #0119" },
    receivedAt: "1h ago",
    receivedAtISO: "2026-07-01T13:22:00Z",
    unread: true,
    flagged: true,
    aiSummary:
      "Amazi following up with the exact Pantone reference (2726 C) and asking for a wet proof timeline. Also attached her brand style guide PDF.",
    aiActionItems: [
      "Schedule wet proof for Wednesday",
      "Log style guide against customer profile",
    ],
    aiSummarizedAt: "Jul 1, 1:26 PM",
    body: {
      kind: "email",
      subject: "Re: QO-189 — Pantone reference for jar labels",
      chain: [
        {
          from: "amazi@amazilabels.com",
          to: "marianna@bazaarprinting.com",
          subject: "Re: QO-189 — Pantone reference for jar labels",
          at: "Jul 1, 1:22 PM",
          body:
            "Hi Marianna,\n\nAs promised — confirmed color is PMS 2726 C. I've attached my brand style guide for your records. When can I expect the wet proof? I'd love to get it in hand by end of week if possible.\n\nAlso, please make sure the proof is on the matte BOPP, not the coated stock.\n\nThanks!\nAmazi",
        },
        {
          from: "marianna@bazaarprinting.com",
          to: "amazi@amazilabels.com",
          subject: "Re: QO-189 — Pantone reference for jar labels",
          at: "Jun 30, 3:35 PM",
          body:
            "Amazi,\n\nGreat — got it, 2726 C on matte BOPP. I'll queue a wet proof run for Wednesday and courier it same-day. You should have it Thursday morning.\n\nHolding the press slot open until we hear back from you.\n\nMarianna",
        },
        {
          from: "amazi@amazilabels.com",
          to: "marianna@bazaarprinting.com",
          subject: "QO-189 — Pantone reference for jar labels",
          at: "Jun 30, 2:41 PM",
          body:
            "Hi Marianna,\n\nQuick note — the Pantone for the labels needs to be 2726 C, uncoated. Please confirm.\n\nAmazi",
        },
      ],
    },
  },
  {
    id: "E-002",
    channel: "email",
    customerName: "Grim Lawd",
    customerCompany: "Grimeylyfe Records",
    contact: "grim@grimeylyfe.com",
    assignedTo: "Hayk",
    linkedTo: { kind: "quote", ref: "QO-184", label: "Quote QO-184" },
    receivedAt: "4h ago",
    receivedAtISO: "2026-07-01T10:10:00Z",
    unread: false,
    aiSummary:
      "Grim reviewed the revised quote with spot UV added. Comfortable with pricing, wants to sign once he sees the metallic gold proof in person.",
    aiActionItems: [
      "Track proof shipment ETA to Melrose studio",
    ],
    aiSummarizedAt: "Jul 1, 10:14 AM",
    body: {
      kind: "email",
      subject: "Re: Updated quote — Mailer w/ Spot UV",
      chain: [
        {
          from: "grim@grimeylyfe.com",
          to: "hayk@bazaarprinting.com",
          subject: "Re: Updated quote — Mailer w/ Spot UV",
          at: "Jul 1, 10:10 AM",
          body:
            "Hayk,\n\nQuote looks good — I'll sign once I see the gold in person. Ship the proof to the studio.\n\nOne love,\nGrim",
        },
        {
          from: "hayk@bazaarprinting.com",
          to: "grim@grimeylyfe.com",
          subject: "Updated quote — Mailer w/ Spot UV",
          at: "Jul 1, 9:45 AM",
          body:
            "Grim,\n\nUpdated quote attached — added the spot UV varnish line ($180) and the physical proof line ($85, credited back on order). Proof ships out this week.\n\nHayk",
        },
      ],
    },
  },
  {
    id: "E-003",
    channel: "email",
    customerName: "Boris Boris",
    customerCompany: "BoyBoy LLC",
    contact: "boris@boyboy.la",
    assignedTo: "Marianna",
    linkedTo: { kind: "order", ref: "ORD-111", label: "Order #0111" },
    receivedAt: "1d ago",
    receivedAtISO: "2026-06-30T16:30:00Z",
    unread: false,
    aiSummary:
      "Boris sending revised die-line for a possible add-on run of 250 lotion pumps. Not urgent — just wants a rough estimate for planning.",
    aiActionItems: [
      "Send rough estimate for 250-pc lotion pump run",
    ],
    aiSummarizedAt: "Jun 30, 4:35 PM",
    body: {
      kind: "email",
      subject: "Add-on: lotion pumps (not urgent)",
      chain: [
        {
          from: "boris@boyboy.la",
          to: "marianna@bazaarprinting.com",
          subject: "Add-on: lotion pumps (not urgent)",
          at: "Jun 30, 4:30 PM",
          body:
            "Hey M,\n\nAttaching revised die for 250 lotion pump wraps. Not urgent — just curious what a small run like this would land at. Thinking timeline is 4–6 weeks out along with the lotion box reorder.\n\nBoris",
        },
      ],
    },
  },
  {
    id: "E-004",
    channel: "email",
    customerName: "SafeCare Packaging",
    customerCompany: "SafeCare Packaging",
    contact: "denise@safecarepack.com",
    assignedTo: "Marianna",
    linkedTo: { kind: "order", ref: "ORD-114", label: "Order #0114" },
    receivedAt: "1d ago",
    receivedAtISO: "2026-06-30T19:12:00Z",
    unread: false,
    aiSummary:
      "Denise confirming credit note details. Also requested vendor W-9 for their year-end audit — needs it before Jul 10.",
    aiActionItems: [
      "Send credit note by Wednesday",
      "Attach current W-9 to reply",
    ],
    aiSummarizedAt: "Jun 30, 7:15 PM",
    body: {
      kind: "email",
      subject: "Re: Credit note — PO 8842 overrun",
      chain: [
        {
          from: "denise@safecarepack.com",
          to: "marianna@bazaarprinting.com",
          subject: "Re: Credit note — PO 8842 overrun",
          at: "Jun 30, 7:12 PM",
          body:
            "Marianna,\n\nAppreciate the fast fix on the credit note. One more thing — can you send us your current W-9? Year-end audit prep, need it before Jul 10.\n\nDenise",
        },
        {
          from: "marianna@bazaarprinting.com",
          to: "denise@safecarepack.com",
          subject: "Credit note — PO 8842 overrun",
          at: "Jun 30, 6:55 PM",
          body:
            "Denise,\n\nCredit note for the 12-unit overrun is being processed today, you'll have it by Wednesday. Extras stay with you as free samples.\n\nMarianna",
        },
      ],
    },
  },
  {
    id: "E-005",
    channel: "email",
    customerName: "Prime Cannabis",
    customerCompany: "Prime Cannabis Co.",
    contact: "miguel@primecannabis.co",
    assignedTo: "Hayk",
    linkedTo: { kind: "customer", ref: "CUST-PRIME", label: "Customer" },
    receivedAt: "2d ago",
    receivedAtISO: "2026-06-29T16:20:00Z",
    unread: false,
    flagged: true,
    aiSummary:
      "Prime's finance sent wire confirmation for overdue $8,420 invoice. Hayk to confirm receipt on Bazaar's side and un-hold production.",
    aiActionItems: [
      "Verify wire posts to Chase account",
      "Un-hold ORD-122 once cleared",
    ],
    aiSummarizedAt: "Jun 29, 4:25 PM",
    body: {
      kind: "email",
      subject: "Wire confirmation — Invoice 3218",
      chain: [
        {
          from: "miguel@primecannabis.co",
          to: "hayk@bazaarprinting.com",
          subject: "Wire confirmation — Invoice 3218",
          at: "Jun 29, 4:20 PM",
          body:
            "Hayk,\n\nAs discussed, wire went out Monday. Confirmation number 8842-CX-11. Should hit your Chase account by tomorrow AM.\n\nPlease let me know once you see it — really appreciate you keeping the queue open.\n\nMiguel",
        },
      ],
    },
  },
  {
    id: "E-006",
    channel: "email",
    customerName: "Nicole Han",
    contact: "nicole.han@gmail.com",
    assignedTo: "Marianna",
    linkedTo: { kind: "lead", ref: "L003", label: "Lead L003" },
    receivedAt: "2d ago",
    receivedAtISO: "2026-06-29T11:00:00Z",
    unread: false,
    aiSummary:
      "Nicole's initial email — 300 rush hoodies for festival Jul 12. Attached mockup and asked for options + turnaround.",
    aiActionItems: [
      "Already handled — see call C-002",
    ],
    aiSummarizedAt: "Jun 29, 11:05 AM",
    body: {
      kind: "email",
      subject: "Rush hoodies — festival Jul 12",
      chain: [
        {
          from: "nicole.han@gmail.com",
          to: "hello@bazaarprinting.com",
          subject: "Rush hoodies — festival Jul 12",
          at: "Jun 29, 11:00 AM",
          body:
            "Hi,\n\nFound you on Instagram. I need 300 hoodies printed for a music festival on July 12. Attaching mockup — front print + small left chest logo. Please advise on turnaround and pricing.\n\nThanks,\nNicole",
        },
      ],
    },
  },
  {
    id: "E-007",
    channel: "email",
    customerName: "Rise Botanicals",
    customerCompany: "Rise Botanicals",
    contact: "sam@risebotanicals.com",
    assignedTo: "Hayk",
    linkedTo: { kind: "customer", ref: "CUST-RISE", label: "Customer" },
    receivedAt: "3d ago",
    receivedAtISO: "2026-06-28T14:45:00Z",
    unread: false,
    aiSummary:
      "Sam sent updated die file for pouches (ORD-118). Waiting on internal press review before scheduling.",
    aiActionItems: [
      "Have production review die file this week",
    ],
    aiSummarizedAt: "Jun 28, 2:50 PM",
    body: {
      kind: "email",
      subject: "Updated die file — pouches",
      chain: [
        {
          from: "sam@risebotanicals.com",
          to: "hayk@bazaarprinting.com",
          subject: "Updated die file — pouches",
          at: "Jun 28, 2:45 PM",
          body:
            "Hayk,\n\nHere's the corrected die file — fixed the top-seal alignment issue from last review. Let me know if it's press-ready.\n\nSam",
        },
      ],
    },
  },
  {
    id: "E-008",
    channel: "email",
    customerName: "Ivy Bloom",
    contact: "ivy@ivybloom.co",
    assignedTo: "Marianna",
    linkedTo: { kind: "lead", ref: "L007", label: "Lead L007" },
    receivedAt: "5h ago",
    receivedAtISO: "2026-07-01T09:12:00Z",
    unread: false,
    aiSummary:
      "Ivy following up on IG conversation via email — attached her brand deck and asked for a formal quote for 5,000 stand-up pouches.",
    aiActionItems: [
      "Build formal quote for 5,000 stand-up pouches",
      "Review brand deck to match paper stock",
    ],
    aiSummarizedAt: "Jul 1, 9:20 AM",
    body: {
      kind: "email",
      subject: "Brand deck + formal quote request",
      chain: [
        {
          from: "ivy@ivybloom.co",
          to: "marianna@bazaarprinting.com",
          subject: "Brand deck + formal quote request",
          at: "Jul 1, 9:12 AM",
          body:
            "Hi Marianna!\n\nMoving from IG to email so we have a proper thread. Attached is our brand deck. I'd love a formal quote for 5,000 stand-up pouches — matte finish with foil accent as we discussed.\n\nCheers,\nIvy",
        },
      ],
    },
  },

  // ─── INSTAGRAM DMs (3) ─────────────────────────────────
  {
    id: "I-001",
    channel: "ig",
    customerName: "Unknown — new lead",
    contact: "@saltandsagesoap",
    assignedTo: "Marianna",
    linkedTo: { kind: "unmatched", ref: "IG-8451", label: "New lead" },
    receivedAt: "34m ago",
    receivedAtISO: "2026-07-01T13:55:00Z",
    unread: true,
    aiSummary:
      "Cold IG DM from soap brand asking about custom kraft-style soap boxes. Small volume (~800 units) but recurring monthly.",
    aiActionItems: [
      "Reply within the hour — IG converts best under 60 min",
      "Create lead record",
    ],
    aiSummarizedAt: "Jul 1, 1:58 PM",
    body: {
      kind: "ig",
      thread: [
        { from: "customer", name: "Salt & Sage Soap", handle: "@saltandsagesoap", at: "1:55 PM", text: "hi! we're a small handmade soap brand, do you do custom kraft-style soap boxes?" },
        { from: "customer", name: "Salt & Sage Soap", handle: "@saltandsagesoap", at: "1:56 PM", text: "about 800/month, recurring" },
      ],
    },
  },
  {
    id: "I-002",
    channel: "ig",
    customerName: "Ivy Bloom",
    contact: "@ivybloompackaging",
    assignedTo: "Marianna",
    linkedTo: { kind: "lead", ref: "L007", label: "Lead L007" },
    receivedAt: "1d ago",
    receivedAtISO: "2026-06-30T08:55:00Z",
    unread: false,
    aiSummary:
      "Ivy's original inquiry. Interested in ~5,000 custom stand-up pouches, matte finish, foil accent. Moved to SMS then email.",
    aiActionItems: [],
    aiSummarizedAt: "Jun 30, 9:05 AM",
    body: {
      kind: "ig",
      thread: [
        { from: "customer", name: "Ivy Bloom", handle: "@ivybloompackaging", at: "8:55 AM", text: "Hi! Love your work. Are you taking new customers for pouches?" },
        { from: "rep", name: "Marianna", handle: "@bazaarprinting", at: "9:02 AM", text: "Hi Ivy! Yes absolutely. What kind of pouches and roughly how many?" },
        { from: "customer", name: "Ivy Bloom", handle: "@ivybloompackaging", at: "9:04 AM", text: "5000 stand-up pouches, matte, small foil accent" },
        { from: "rep", name: "Marianna", handle: "@bazaarprinting", at: "9:07 AM", text: "Perfect — that's right in our wheelhouse. Best number to reach you at? I can send options over" },
        { from: "customer", name: "Ivy Bloom", handle: "@ivybloompackaging", at: "9:09 AM", text: "562-555-0910. Thanks!" },
      ],
    },
  },
  {
    id: "I-003",
    channel: "ig",
    customerName: "Unknown — new lead",
    contact: "@northgatewellness",
    assignedTo: "Marianna",
    linkedTo: { kind: "unmatched", ref: "IG-8492", label: "New lead" },
    receivedAt: "3d ago",
    receivedAtISO: "2026-06-28T18:30:00Z",
    unread: false,
    aiSummary:
      "Wellness brand asking if Bazaar prints on hemp paper. Follow-up needed — hasn't been replied to.",
    aiActionItems: [
      "Reply — offer alternative eco stocks if hemp not available",
    ],
    aiSummarizedAt: "Jun 28, 6:35 PM",
    body: {
      kind: "ig",
      thread: [
        { from: "customer", name: "Northgate Wellness", handle: "@northgatewellness", at: "6:30 PM", text: "Do you print on hemp paper? Looking for something eco for our new tea line" },
      ],
    },
  },

  // ─── WEB FORMS (3) ─────────────────────────────────────
  {
    id: "W-001",
    channel: "web_form",
    customerName: "Unknown — new lead",
    customerCompany: "Blackbird Roasters",
    contact: "orders@blackbirdroasters.com",
    assignedTo: "Unassigned",
    linkedTo: { kind: "unmatched", ref: "FORM-2211", label: "Web form" },
    receivedAt: "1h ago",
    receivedAtISO: "2026-07-01T13:05:00Z",
    unread: true,
    flagged: true,
    aiSummary:
      "Coffee roaster requesting quote for 2,500 valve bags, 12oz, one-color print. Timeline: 3 weeks. Big potential — mentions they roast for 12 cafes.",
    aiActionItems: [
      "Assign to SDR immediately",
      "Send valve-bag stock samples with quote",
      "Ask about long-term contract volume",
    ],
    aiSummarizedAt: "Jul 1, 1:08 PM",
    body: {
      kind: "web_form",
      formName: "Get a Quote — bazaarprinting.com/quote",
      fields: [
        { label: "Name", value: "Ana Ruiz" },
        { label: "Company", value: "Blackbird Roasters" },
        { label: "Email", value: "orders@blackbirdroasters.com" },
        { label: "Phone", value: "+1 (206) 555-0844" },
        { label: "Product interest", value: "Custom valve coffee bags" },
        { label: "Quantity", value: "2,500 units" },
        { label: "Size", value: "12oz" },
        { label: "Timeline", value: "3 weeks" },
        { label: "How did you hear about us?", value: "Google search" },
        { label: "Message", value: "We roast for 12 cafes across the Pacific Northwest and are looking to switch printers. Would love to see samples of your valve bag lineup and get pricing on 2,500 units with one-color print." },
      ],
      attachments: [{ name: "blackbird-logo.pdf", size: "184 KB" }],
    },
  },
  {
    id: "W-002",
    channel: "web_form",
    customerName: "Unknown — new lead",
    customerCompany: "Kismet Botanicals",
    contact: "hi@kismetbotanicals.com",
    assignedTo: "Unassigned",
    linkedTo: { kind: "unmatched", ref: "FORM-2214", label: "Web form" },
    receivedAt: "8h ago",
    receivedAtISO: "2026-07-01T06:20:00Z",
    unread: true,
    aiSummary:
      "Botanicals brand asking about custom pre-roll tubes and labels combo. Provided artwork already. Timeline flexible.",
    aiActionItems: [
      "Assign to SDR",
      "Send combo pricing template (tube + label)",
    ],
    aiSummarizedAt: "Jul 1, 6:24 AM",
    body: {
      kind: "web_form",
      formName: "Get a Quote — bazaarprinting.com/quote",
      fields: [
        { label: "Name", value: "Devon Miles" },
        { label: "Company", value: "Kismet Botanicals" },
        { label: "Email", value: "hi@kismetbotanicals.com" },
        { label: "Phone", value: "+1 (415) 555-0621" },
        { label: "Product interest", value: "Pre-roll tubes + custom labels" },
        { label: "Quantity", value: "1,000 units" },
        { label: "Timeline", value: "Flexible" },
        { label: "How did you hear about us?", value: "Referral — Grimeylyfe Records" },
        { label: "Message", value: "Grim recommended you — need clean tubes with a matching wraparound label. Artwork is finished, ready to send." },
      ],
      attachments: [
        { name: "kismet-label-final.ai", size: "3.2 MB" },
        { name: "kismet-brand-colors.pdf", size: "412 KB" },
      ],
    },
  },
  {
    id: "W-003",
    channel: "web_form",
    customerName: "Unknown — new lead",
    contact: "tara.p@fernandflora.com",
    assignedTo: "Unassigned",
    linkedTo: { kind: "unmatched", ref: "FORM-2210", label: "Web form" },
    receivedAt: "2d ago",
    receivedAtISO: "2026-06-29T20:10:00Z",
    unread: false,
    aiSummary:
      "Small skincare studio inquiring about custom jars + shrink sleeves. Volume small (~300 units) — good starter lead for portfolio building.",
    aiActionItems: [
      "Assign to SDR — low priority follow-up",
    ],
    aiSummarizedAt: "Jun 29, 8:15 PM",
    body: {
      kind: "web_form",
      formName: "Get a Quote — bazaarprinting.com/quote",
      fields: [
        { label: "Name", value: "Tara Patel" },
        { label: "Company", value: "Fern & Flora" },
        { label: "Email", value: "tara.p@fernandflora.com" },
        { label: "Phone", value: "" },
        { label: "Product interest", value: "Glass jars + shrink sleeves" },
        { label: "Quantity", value: "300 units" },
        { label: "Timeline", value: "1–2 months" },
        { label: "How did you hear about us?", value: "Instagram" },
        { label: "Message", value: "Just starting out — small first run to test packaging. Would love to see options in the $8–12 per unit range if possible." },
      ],
    },
  },
];

export const UNREAD_COUNT = COMM_ITEMS.filter((c) => c.unread).length;

// Helper — get last N comms tied to a lead (by lead ref, phone, or email match)
export function commsForLead(
  leadId: string,
  phone?: string,
  email?: string,
  instagram?: string,
  limit = 3
): CommItem[] {
  return COMM_ITEMS.filter((c) => {
    if (c.linkedTo.kind === "lead" && c.linkedTo.ref === leadId) return true;
    if (phone && c.contact.replace(/\D/g, "").endsWith(phone.replace(/\D/g, "").slice(-7))) return true;
    if (email && c.contact.toLowerCase() === email.toLowerCase()) return true;
    if (instagram && c.contact.toLowerCase() === instagram.toLowerCase()) return true;
    return false;
  })
    .sort((a, b) => (a.receivedAtISO > b.receivedAtISO ? -1 : 1))
    .slice(0, limit);
}
