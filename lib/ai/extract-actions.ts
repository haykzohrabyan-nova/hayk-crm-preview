// Promise engine — turns one communication (call summary/transcript, SMS, email,
// or IG/webform message) into STRUCTURED next-steps: a one-line headline, the
// concrete tasks the team promised to do, and whether it's a deal opportunity.
// This is the shared brain behind auto-tasks, auto-deals, and the live channel
// summaries. It NEVER invents — if nothing was promised, tasks come back empty.
import { createHash } from "crypto";

export type ExtractedTask = {
  title: string;
  // callback = call them back; quote = send/revise a quote; artwork = handle files/proof;
  // followup = generic follow-up; other = anything else the rep committed to.
  kind: "callback" | "quote" | "artwork" | "followup" | "other";
};

export type ExtractedDeal = {
  detected: boolean;
  product: string; // e.g. "custom die-cut stickers"
  quantity: string; // e.g. "250" (free text; "" if unknown)
  amount: string; // e.g. "$75" ("" if unknown)
  quote_promised: boolean; // rep said they'd send/revise a quote
  reason: string; // one short line: why this is an opportunity
};

export type ExtractedActions = {
  headline: string; // one plain-English line of what happened
  intent: string; // why this communication exists / what the customer wants ("" if no content)
  next_step: string; // the single clearest action for the rep ("Send quote", "Call back", "No action needed")
  is_noise: boolean; // true when NOT a real customer conversation (internal note, bare signature, auto-reply, boilerplate)
  tasks: ExtractedTask[]; // things THE TEAM must do next (their promises)
  deal: ExtractedDeal | null;
  sentiment: "positive" | "neutral" | "negative";
  input_hash: string; // for idempotent caching / dedupe
};

type Input = {
  text: string; // the summary / transcript / message body
  channel?: string | null; // call | sms | email | ig_dm | webform | ...
  contactName?: string | null;
  direction?: string | null; // inbound | outbound
};

const cache = new Map<string, ExtractedActions>();

const SYSTEM = `You convert one customer communication at a printing company (Bazaar Printing) into structured next-steps for the sales rep. Return STRICT JSON only.

Rules:
- Only extract things that were ACTUALLY said. Never invent tasks, products, quantities, prices, intents, or next-steps.
- "intent" = ONE plain line saying why this communication exists / what the customer wants (e.g. "Wants a quote on 1,000 gloss labels", "Asking about turnaround time", "Complaint about wrong proof"). If there is no real customer content, return "".
- "next_step" = the SINGLE clearest action the rep should take next ("Send quote", "Call back", "Send proof", "Follow up"). If nothing is needed, return "No action needed".
- "is_noise" = true when this is NOT a real customer conversation. Flag as noise: internal rep-to-rep notes (staff talking to each other about logistics/warehouse/scheduling), a bare email signature or footer with no message (e.g. "Gary Garibyan · Account Manager · [image: icon] · bazaarprinting.com"), automatic replies / out-of-office, and forwarded boilerplate with no customer ask. A genuine inbound customer question, quote request, or complaint is NOT noise. When is_noise is true, keep tasks empty and deal.detected false.
- "tasks" = concrete things the REP/TEAM promised or clearly must do next (e.g. "send the quote", "call back Monday", "revise quote to 6 labels", "email the proof"). If the rep promised nothing and no follow-up is clearly needed, return an empty array. Keep each task title short and action-first.
- "deal.detected" = true ONLY if the customer expressed real interest in a specific product/order OR the rep promised a quote. Fill product/quantity/amount only if explicitly mentioned, else "".
- Do not turn a pure greeting, wrong number, or "no answer" into tasks or a deal.
- sentiment reflects the customer's tone.

Return exactly:
{"headline": string, "intent": string, "next_step": string, "is_noise": boolean, "tasks": [{"title": string, "kind": "callback|quote|artwork|followup|other"}], "deal": {"detected": boolean, "product": string, "quantity": string, "amount": string, "quote_promised": boolean, "reason": string}, "sentiment": "positive|neutral|negative"}`;

export async function extractActions(input: Input): Promise<ExtractedActions> {
  const text = (input.text ?? "").trim();
  const hash = createHash("md5").update(`${input.channel ?? ""}|${text}`).digest("hex");
  const hit = cache.get(hash);
  if (hit) return hit;

  const empty: ExtractedActions = {
    headline: text ? text.split(/\r?\n/)[0].slice(0, 120) : "No content",
    intent: "",
    next_step: "No action needed",
    is_noise: false,
    tasks: [],
    deal: null,
    sentiment: "neutral",
    input_hash: hash,
  };
  if (!text || text.length < 12) return empty;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return empty;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Channel: ${input.channel ?? "unknown"} (${input.direction ?? "?"})\nContact: ${input.contactName ?? "unknown"}\n\nCommunication:\n${text.slice(0, 4000)}`,
          },
        ],
      }),
    });
    if (!res.ok) return empty;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<ExtractedActions>;
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks
          .filter((t) => t && typeof t.title === "string" && t.title.trim())
          .slice(0, 5)
          .map((t) => ({ title: String(t.title).trim().slice(0, 140), kind: normKind(t.kind) }))
      : [];
    const deal = parsed.deal && parsed.deal.detected
      ? {
          detected: true,
          product: String(parsed.deal.product ?? "").slice(0, 120),
          quantity: String(parsed.deal.quantity ?? "").slice(0, 60),
          amount: String(parsed.deal.amount ?? "").slice(0, 40),
          quote_promised: Boolean(parsed.deal.quote_promised),
          reason: String(parsed.deal.reason ?? "").slice(0, 200),
        }
      : null;
    const isNoise = Boolean(parsed.is_noise);
    const out: ExtractedActions = {
      headline: String(parsed.headline ?? empty.headline).slice(0, 160),
      intent: String(parsed.intent ?? "").trim().slice(0, 240),
      next_step: String(parsed.next_step ?? "").trim().slice(0, 120) || "No action needed",
      is_noise: isNoise,
      // When the model flags noise, never emit tasks/deals off it (belt-and-suspenders).
      tasks: isNoise ? [] : tasks,
      deal: isNoise ? null : deal,
      sentiment: (["positive", "neutral", "negative"] as const).includes(parsed.sentiment as never)
        ? (parsed.sentiment as ExtractedActions["sentiment"])
        : "neutral",
      input_hash: hash,
    };
    cache.set(hash, out);
    return out;
  } catch {
    return empty;
  }
}

function normKind(k: unknown): ExtractedTask["kind"] {
  const v = String(k ?? "").toLowerCase();
  return (["callback", "quote", "artwork", "followup", "other"] as const).includes(v as never)
    ? (v as ExtractedTask["kind"])
    : "other";
}
