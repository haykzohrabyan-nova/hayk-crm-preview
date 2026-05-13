"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, X, ChevronRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LookupItem = {
  id: string;
  category: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

type Category = {
  category: string;
  label: string;
  section: "leads" | "order";
  items: LookupItem[];
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-start gap-3 rounded-[10px] px-4 py-3 shadow-lg text-[13px] font-medium max-w-sm"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeftWidth: "4px",
        borderLeftColor: type === "success" ? "var(--color-success)" : "var(--color-danger)",
        color: "var(--color-text-primary)",
      }}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div
        className="rounded-[12px] p-6 w-full max-w-sm shadow-xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <h3 className="text-[15px] font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </h3>
        <p className="text-[13px] mb-5" style={{ color: "var(--color-text-muted)" }}>
          {message}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="rounded-[6px] px-4 py-1.5 text-[13px] font-medium border"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-[6px] px-4 py-1.5 text-[13px] font-medium"
            style={{ background: "var(--color-danger)", color: "#fff" }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Right panel — options for selected category ──────────────────────────────

function OptionsPanel({
  category,
  onReload,
  showToast,
}: {
  category: Category;
  onReload: () => void;
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LookupItem | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAdd) setTimeout(() => addInputRef.current?.focus(), 50);
  }, [showAdd]);

  // Reset add state when category changes
  useEffect(() => {
    setShowAdd(false);
    setNewLabel("");
    setEditingId(null);
  }, [category.category]);

  async function handleAdd() {
    if (!newLabel.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/lookups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: category.category, label: newLabel.trim() }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { showToast(data.error, "error"); return; }
    showToast(`"${newLabel.trim()}" added`, "success");
    setShowAdd(false);
    setNewLabel("");
    onReload();
  }

  async function handleSaveEdit(item: LookupItem) {
    if (!editLabel.trim() || editLabel.trim() === item.label) {
      setEditingId(null);
      return;
    }
    setBusyId(item.id);
    const res = await fetch(`/api/admin/lookups/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel.trim() }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) { showToast(data.error, "error"); return; }
    showToast("Saved", "success");
    setEditingId(null);
    onReload();
  }

  async function handleToggleActive(item: LookupItem) {
    setBusyId(item.id);
    const res = await fetch(`/api/admin/lookups/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !item.is_active }),
    });
    setBusyId(null);
    if (!res.ok) { showToast("Failed to update", "error"); return; }
    onReload();
  }

  async function handleDelete(item: LookupItem) {
    setBusyId(item.id);
    const res = await fetch(`/api/admin/lookups/${item.id}`, { method: "DELETE" });
    const data = await res.json();
    setBusyId(null);
    setConfirmDelete(null);
    if (!res.ok) { showToast(data.error, "error"); return; }
    showToast(`"${item.label}" deleted`, "success");
    onReload();
  }

  return (
    <div
      className="rounded-[10px] border overflow-hidden flex flex-col"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ background: "var(--color-row-alt)", borderColor: "var(--color-border)" }}
      >
        <div className="flex-1 min-w-0">
          <span className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {category.label}
          </span>
          <span
            className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={
              category.section === "order"
                ? { background: "var(--color-info-bg)", color: "var(--color-info-text)" }
                : { background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }
            }
          >
            {category.section === "order" ? "Order / Quote" : "Lead Forms"}
          </span>
        </div>
        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          {category.items.length} option{category.items.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => { setShowAdd(true); setNewLabel(""); }}
          className="flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-[12px] font-medium"
          style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
        >
          <Plus className="h-3.5 w-3.5" /> Add Option
        </button>
      </div>

      {/* Add option inline form */}
      {showAdd && (
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="flex gap-2">
            <input
              ref={addInputRef}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") { setShowAdd(false); setNewLabel(""); }
              }}
              placeholder="Option label…"
              className="flex-1 rounded-[6px] border px-3 py-1.5 text-[13px] outline-none"
              style={{
                borderColor: "var(--color-accent)",
                background: "var(--color-bg)",
                color: "var(--color-text-primary)",
              }}
            />
            <button
              onClick={handleAdd}
              disabled={saving || !newLabel.trim()}
              className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium disabled:opacity-40"
              style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
            >
              {saving ? "…" : "Add"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewLabel(""); }}
              className="rounded-[6px] px-3 py-1.5 text-[13px] border"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
            >
              Cancel
            </button>
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            A URL-safe slug is auto-generated from the label and cannot be changed after creation.
          </p>
        </div>
      )}

      {/* Options list */}
      <div className="overflow-y-auto max-h-[520px]">
        {category.items.length === 0 ? (
          <div className="py-12 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            No options yet — click &ldquo;Add Option&rdquo; above
          </div>
        ) : (
          category.items.map((item, i) => (
            <div
              key={item.id}
              className="flex items-center gap-2 px-4 py-2.5 border-b last:border-b-0"
              style={{
                borderColor: "var(--color-border)",
                background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                opacity: item.is_active ? 1 : 0.5,
              }}
            >
              {editingId === item.id ? (
                <div className="flex flex-1 gap-2">
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(item);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 rounded-[4px] border px-2 py-1 text-[13px] outline-none"
                    style={{ borderColor: "var(--color-accent)", background: "var(--color-bg)", color: "var(--color-text-primary)" }}
                  />
                  <button
                    onClick={() => handleSaveEdit(item)}
                    disabled={busyId === item.id}
                    className="rounded px-2.5 py-1 text-[12px] font-medium disabled:opacity-40"
                    style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                  >
                    {busyId === item.id ? "…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded px-2.5 py-1 text-[12px] border"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                      {item.label}
                    </span>
                    <span
                      className="ml-2 font-mono text-[10px] rounded px-1 py-0.5"
                      style={{ background: "var(--color-row-alt)", color: "var(--color-text-muted)" }}
                    >
                      {item.value}
                    </span>
                  </div>

                  {/* Active toggle */}
                  <button
                    onClick={() => handleToggleActive(item)}
                    disabled={busyId === item.id}
                    title={item.is_active ? "Active — click to deactivate" : "Inactive — click to activate"}
                    className="rounded-full transition-colors disabled:opacity-40"
                    style={{
                      width: 28, height: 16,
                      background: item.is_active ? "var(--color-success)" : "var(--color-border)",
                      position: "relative", flexShrink: 0,
                    }}
                  >
                    <span
                      className="absolute top-0.5 rounded-full bg-white transition-all"
                      style={{ width: 12, height: 12, left: item.is_active ? 14 : 2 }}
                    />
                  </button>

                  {/* Rename */}
                  <button
                    onClick={() => { setEditingId(item.id); setEditLabel(item.label); }}
                    className="p-1 rounded hover:opacity-70"
                    style={{ color: "var(--color-text-muted)" }}
                    title="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setConfirmDelete(item)}
                    disabled={busyId === item.id}
                    className="p-1 rounded hover:opacity-70 disabled:opacity-40"
                    style={{ color: "var(--color-danger)" }}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.label}"?`}
          message="If this option is in use on any existing lead or ticket, deletion will be blocked — deactivate it instead to hide it from new forms without losing historical data."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const SECTION_LABELS: Record<"leads" | "order", string> = {
  leads: "Lead Forms",
  order: "Order / Quote",
};

export function DropdownsSection() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => setToast({ message, type }),
    []
  );

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/lookups");
    const data = await res.json();
    const cats: Category[] = data.categories ?? [];
    setCategories(cats);
    setLoading(false);
    setSelectedKey((prev) => prev ?? cats[0]?.category ?? null);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const selected = categories.find((c) => c.category === selectedKey) ?? null;

  // Group into sections for the sidebar
  const grouped = categories.reduce<Record<"leads" | "order", Category[]>>(
    (acc, c) => { acc[c.section].push(c); return acc; },
    { leads: [], order: [] }
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 rounded-[10px] animate-pulse" style={{ background: "var(--color-row-alt)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* ── Left: category list ── */}
      <div className="w-64 shrink-0 flex flex-col gap-1">
        {(["leads", "order"] as const).map((section) => (
          <div key={section} className="mb-1">
            {/* Section header */}
            <div
              className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest mb-0.5"
              style={{ color: "var(--color-text-muted)" }}
            >
              {SECTION_LABELS[section]}
            </div>

            <div className="rounded-[10px] border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              {grouped[section].map((cat, i) => {
                const isSelected = selectedKey === cat.category;
                return (
                  <button
                    key={cat.category}
                    onClick={() => setSelectedKey(cat.category)}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-left"
                    style={{
                      background: isSelected
                        ? "var(--color-row-hover)"
                        : i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                      borderBottom:
                        i < grouped[section].length - 1
                          ? "1px solid var(--color-border)"
                          : undefined,
                    }}
                  >
                    {isSelected && (
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: "var(--color-tab-active)" }}
                      />
                    )}
                    <span
                      className="flex-1 text-[13px] truncate"
                      style={{
                        color: isSelected
                          ? "var(--color-tab-active)"
                          : "var(--color-text-primary)",
                        fontWeight: isSelected ? 500 : 400,
                      }}
                    >
                      {cat.label}
                    </span>
                    <span
                      className="text-[11px] tabular-nums"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {cat.items.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Right: options for selected category ── */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div
            className="h-48 flex items-center justify-center rounded-[10px] border text-[13px]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            Select a category to manage its options
          </div>
        ) : (
          <OptionsPanel
            key={selected.category}
            category={selected}
            onReload={reload}
            showToast={showToast}
          />
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
