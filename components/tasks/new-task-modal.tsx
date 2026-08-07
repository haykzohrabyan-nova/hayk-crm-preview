"use client";

// Reusable "New task" dialog for the azat CRM. A manager fills in who to assign
// the task to, what the task is, when it's due (with quick date presets), which
// contact it links to, and — once a contact is picked — which of that contact's
// deals it attaches to. Then it POSTs to /api/tasks. The API enforces role rules
// (managers can assign anyone; non-managers are forced to themselves).
//
// Reusable from anywhere: control `open`/`onOpenChange`, pass an optional
// `defaultContact` / `defaultLabel` to pre-fill (e.g. from Missed Calls / Inbox),
// and `onCreated` fires with the created task so the caller can refetch.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { REPS } from "@/lib/azat/reps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LinkedContact = { id: string; name: string };

type ContactHit = { id: string; name: string; subtitle: string | null };

// A deal as returned by GET /api/contact/[id].
type ContactDeal = {
  id: string;
  title: string | null;
  stage: string | null;
  value_cents?: number | null;
};

// Sentinel value for the deal <Select> meaning "link the person, not a deal".
const NO_DEAL = "__none__";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CreatedTask = Record<string, any>;

export interface NewTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires with the created task on success (caller refetches its list). */
  onCreated?: (task: CreatedTask) => void;
  /** Pre-select an owner (defaults to the first rep). */
  defaultOwnerId?: string;
  /** Pre-fill the task label. */
  defaultLabel?: string;
  /** Pre-link a contact (skips the search box). */
  defaultContact?: LinkedContact | null;
}

/** A Date `days` from now, at local 9:00am (matches the quick-preset semantics). */
function daysFromNowAt9(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Format a Date as a `datetime-local` value ("YYYY-MM-DDTHH:mm") in local time. */
function toLocalInput(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Turn a `datetime-local` value into an ISO timestamp (falls back to now). */
function localInputToIso(v: string): string {
  const at = new Date(v);
  return isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString();
}

// Quick "due" presets — each sets the due date to that day at 9:00am.
const QUICK_PRESETS: { label: string; days: number }[] = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
];

export function NewTaskModal({
  open,
  onOpenChange,
  onCreated,
  defaultOwnerId,
  defaultLabel,
  defaultContact,
}: NewTaskModalProps) {
  const [ownerId, setOwnerId] = useState<string>(defaultOwnerId ?? REPS[0].id);
  const [label, setLabel] = useState<string>(defaultLabel ?? "");
  const [due, setDue] = useState<string>(() => toLocalInput(daysFromNowAt9(1)));
  const [linked, setLinked] = useState<LinkedContact | null>(defaultContact ?? null);

  const [search, setSearch] = useState<string>("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [showHits, setShowHits] = useState(false);

  // Deals belonging to the linked contact (loaded on pick).
  const [deals, setDeals] = useState<ContactDeal[]>([]);
  const [dealId, setDealId] = useState<string>(NO_DEAL);
  const [loadingDeals, setLoadingDeals] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Reset form each time the modal opens.
  useEffect(() => {
    if (open) {
      setOwnerId(defaultOwnerId ?? REPS[0].id);
      setLabel(defaultLabel ?? "");
      setDue(toLocalInput(daysFromNowAt9(1)));
      setLinked(defaultContact ?? null);
      setSearch("");
      setHits([]);
      setShowHits(false);
      setDeals([]);
      setDealId(NO_DEAL);
      setError(null);
    }
  }, [open, defaultOwnerId, defaultLabel, defaultContact]);

  // Debounced contact typeahead against azat.contacts.
  useEffect(() => {
    if (linked) return; // already picked one
    const q = search.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(q)}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!cancelled) {
          setHits(Array.isArray(data.contacts) ? data.contacts : []);
          setShowHits(true);
        }
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, linked]);

  // When a contact is picked, load THAT contact's deals so the task can attach
  // to a specific deal (not just the person). Clearing the contact clears deals.
  useEffect(() => {
    if (!linked) {
      setDeals([]);
      setDealId(NO_DEAL);
      return;
    }
    let active = true;
    setLoadingDeals(true);
    setDealId(NO_DEAL);
    (async () => {
      try {
        const res = await fetch(`/api/contact/${linked.id}`, { credentials: "include" });
        const data = await res.json();
        if (!active) return;
        const loaded: ContactDeal[] = Array.isArray(data.deals) ? data.deals : [];
        // Open deals first; closed (won/lost) last.
        loaded.sort((a, b) => {
          const aClosed = a.stage ? ["won", "lost"].includes(a.stage) : false;
          const bClosed = b.stage ? ["won", "lost"].includes(b.stage) : false;
          return Number(aClosed) - Number(bClosed);
        });
        setDeals(loaded);
      } catch {
        if (active) setDeals([]);
      } finally {
        if (active) setLoadingDeals(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [linked]);

  // Close the hit list on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowHits(false);
      }
    }
    if (showHits) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showHits]);

  const canSubmit = useMemo(
    () => !!ownerId && label.trim().length > 0 && !submitting,
    [ownerId, label, submitting],
  );

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: "followup",
          label: label.trim(),
          owner_id: ownerId,
          due_at: localInputToIso(due),
          contact_id: linked?.id ?? null,
          deal_id: dealId !== NO_DEAL ? dealId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create task.");
        return;
      }
      onCreated?.(data.task);
      onOpenChange(false);
    } catch {
      setError("Could not create task.");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, label, ownerId, due, linked, dealId, onCreated, onOpenChange]);

  const labelStyle = { color: "var(--color-text-primary)" } as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Create a follow-up and assign it to a team member.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Assign to */}
          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium" style={labelStyle}>
              Assign to <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <Select value={ownerId} onValueChange={(v) => v && setOwnerId(v)}>
              <SelectTrigger
                className="h-9 w-full text-[13px]"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                }}
              >
                <SelectValue placeholder="Select a rep">
                  {REPS.find((r) => r.id === ownerId)?.name ?? "Select a rep"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {REPS.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Task label */}
          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium" style={labelStyle}>
              Task <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Call back about box quote"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) void submit();
              }}
            />
          </div>

          {/* Due date + time, with quick presets (each sets that day at 9:00am) */}
          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium" style={labelStyle}>
              Due
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PRESETS.map((q) => {
                const active = due === toLocalInput(daysFromNowAt9(q.days));
                return (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setDue(toLocalInput(daysFromNowAt9(q.days)))}
                    className="rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors"
                    style={{
                      background: active ? "var(--color-badge-bg)" : "var(--color-bg)",
                      color: active ? "var(--color-badge-text)" : "var(--color-text-muted)",
                      border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
                    }}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
            <Input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="h-9 text-[13px]"
            />
          </div>

          {/* Link to contact (optional) */}
          <div className="grid gap-1.5" ref={searchBoxRef}>
            <label className="text-[12px] font-medium" style={labelStyle}>
              Link to contact <span style={{ color: "var(--color-text-muted)" }}>(optional)</span>
            </label>

            {linked ? (
              <div
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[13px]"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                }}
              >
                <span className="truncate">{linked.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setLinked(null);
                    setSearch("");
                  }}
                  style={{ color: "var(--color-text-muted)" }}
                  aria-label="Clear linked contact"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                    style={{ color: "var(--color-text-muted)" }}
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => hits.length && setShowHits(true)}
                    placeholder="Search contacts by name…"
                    className="pl-8"
                  />
                  {searching && (
                    <Loader2
                      className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin"
                      style={{ color: "var(--color-text-muted)" }}
                    />
                  )}
                </div>

                {showHits && (search.trim().length >= 2) && (
                  <div
                    className="absolute z-[100] mt-1 max-h-56 w-full overflow-y-auto rounded-lg border py-1 shadow-md"
                    style={{
                      background: "var(--color-surface)",
                      borderColor: "var(--color-border)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    }}
                  >
                    {hits.length === 0 ? (
                      <p className="px-3 py-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                        {searching ? "Searching…" : "No contacts found"}
                      </p>
                    ) : (
                      hits.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => {
                            setLinked({ id: h.id, name: h.name });
                            setShowHits(false);
                          }}
                          className="flex w-full flex-col items-start px-3 py-1.5 text-left transition-colors"
                          style={{ color: "var(--color-text-primary)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--color-row-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <span className="text-[13px] font-medium">{h.name}</span>
                          {h.subtitle && (
                            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                              {h.subtitle}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Link to deal (only once a contact is chosen) */}
          {linked && (
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium" style={labelStyle}>
                Link to deal <span style={{ color: "var(--color-text-muted)" }}>(optional)</span>
              </label>
              <Select
                value={dealId}
                onValueChange={(v) => v && setDealId(v)}
                disabled={loadingDeals || deals.length === 0}
              >
                <SelectTrigger
                  className="h-9 w-full text-[13px]"
                  style={{
                    borderColor: "var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  <SelectValue>
                    {loadingDeals
                      ? "Loading deals…"
                      : dealId === NO_DEAL
                        ? deals.length
                          ? "Person only — no deal"
                          : "No deals for this person"
                        : (() => {
                            const d = deals.find((x) => x.id === dealId);
                            return d ? `${d.title || "Untitled deal"}${d.stage ? ` · ${d.stage}` : ""}` : "Person only — no deal";
                          })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DEAL}>
                    {deals.length ? "Person only — no deal" : "No deals for this person"}
                  </SelectItem>
                  {deals.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {(d.title || "Untitled deal") + (d.stage ? ` · ${d.stage}` : "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <p className="text-[12px]" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              "Create task"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
