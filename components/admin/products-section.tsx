"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, X, Check, ChevronRight, GripVertical } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductType = {
  id: string;
  name: string;
  default_print_type: "Roll" | "Sheet" | "Unit";
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  facility: string;
  material_ids: string[];
};

type Material = {
  id: string;
  group_id: string | null;
  name: string;
  category: string;
  facility: string;
  sort_order: number;
  is_active: boolean;
  default_unit: string;
};

type MaterialGroup = {
  id: string;
  name: string;
  facility: string | null;
  sort_order: number;
  is_active: boolean;
  materials: Material[];
};

// ─── Small helpers ────────────────────────────────────────────────────────────

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
        borderLeftColor:
          type === "success" ? "var(--color-success)" : "var(--color-danger)",
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

function PrintTypePill({ type }: { type: "Roll" | "Sheet" | "Unit" }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={
        type === "Roll"
          ? { background: "var(--color-info-bg)", color: "var(--color-info-text)" }
          : type === "Unit"
          ? { background: "var(--color-warning-bg)", color: "var(--color-warning)" }
          : { background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }
      }
    >
      {type}
    </span>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
    >
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

// ─── Material panel (right side) ──────────────────────────────────────────────

function MaterialPanel({
  product,
  allMaterials,
  onReload,
  showToast,
}: {
  product: ProductType;
  allMaterials: Material[];
  onReload: () => void;
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [addingName, setAddingName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [suggestions, setSuggestions] = useState<Material[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<Material | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Material | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Materials linked to this product
  const linked = allMaterials.filter((m) => product.material_ids.includes(m.id));
  // All materials not yet linked (for suggestions)
  const unlinked = allMaterials.filter((m) => !product.material_ids.includes(m.id));

  useEffect(() => {
    if (showAdd) setTimeout(() => addInputRef.current?.focus(), 50);
  }, [showAdd]);

  function handleSearchInput(val: string) {
    setAddingName(val);
    if (!val.trim()) { setSuggestions([]); return; }
    const q = val.toLowerCase();
    setSuggestions(unlinked.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8));
  }

  async function handleAddMaterial(name: string, existingId?: string) {
    if (!name.trim()) return;
    setBusy("adding");

    let matId = existingId;

    if (!matId) {
      // Create a new material in the library and link it
      const res = await fetch("/api/admin/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error, "error"); setBusy(null); return; }
      matId = data.material.id;
    }

    // Link to current product
    const linkRes = await fetch(
      `/api/admin/product-types/${product.id}/materials/${matId}`,
      { method: "POST" }
    );
    setBusy(null);
    if (!linkRes.ok) { showToast("Failed to add material", "error"); return; }
    showToast(`"${name.trim()}" added`, "success");
    setAddingName("");
    setSuggestions([]);
    setShowAdd(false);
    onReload();
  }

  async function handleRemoveFromProduct(mat: Material) {
    setBusy(mat.id);
    const res = await fetch(
      `/api/admin/product-types/${product.id}/materials/${mat.id}`,
      { method: "DELETE" }
    );
    setBusy(null);
    setConfirmRemove(null);
    if (!res.ok) { showToast("Failed to remove", "error"); return; }
    showToast(`"${mat.name}" removed from ${product.name}`, "success");
    onReload();
  }

  async function handleDeleteMaterial(mat: Material) {
    const res = await fetch(`/api/admin/materials/${mat.id}`, { method: "DELETE" });
    const data = await res.json();
    setConfirmDelete(null);
    if (!res.ok) { showToast(data.error, "error"); return; }
    showToast(`"${mat.name}" deleted`, "success");
    onReload();
  }

  async function handleToggleActive(mat: Material) {
    const res = await fetch(`/api/admin/materials/${mat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !mat.is_active }),
    });
    if (!res.ok) { showToast("Failed to update", "error"); return; }
    onReload();
  }

  async function handleSaveEdit(mat: Material) {
    const res = await fetch(`/api/admin/materials/${mat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, "error"); return; }
    showToast("Saved", "success");
    setEditingId(null);
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
        <span className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {product.name}
        </span>
        <PrintTypePill type={product.default_print_type} />
        <span className="text-[12px] ml-auto" style={{ color: "var(--color-text-muted)" }}>
          {linked.length} material{linked.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => { setShowAdd(true); setAddingName(""); setSuggestions([]); }}
          className="flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-[12px] font-medium"
          style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
        >
          <Plus className="h-3.5 w-3.5" /> Add Material
        </button>
      </div>

      {/* Add material input */}
      {showAdd && (
        <div
          className="px-4 py-3 border-b relative"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                ref={addInputRef}
                value={addingName}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddMaterial(addingName);
                  if (e.key === "Escape") { setShowAdd(false); setAddingName(""); setSuggestions([]); }
                }}
                placeholder="Material name — type to search existing or create new…"
                className="w-full rounded-[6px] border px-3 py-1.5 text-[13px] outline-none"
                style={{
                  borderColor: "var(--color-accent)",
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                }}
              />
              {/* Suggestions dropdown */}
              {suggestions.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 z-20 rounded-[8px] border shadow-lg overflow-hidden"
                  style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
                >
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleAddMaterial(s.name, s.id)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-left text-[13px] hover:opacity-80"
                      style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                    >
                      <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-success)" }} />
                      {s.name}
                      <span className="ml-auto text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                        link existing
                      </span>
                    </button>
                  ))}
                  {addingName.trim() && !suggestions.find((s) => s.name.toLowerCase() === addingName.toLowerCase()) && (
                    <button
                      onClick={() => handleAddMaterial(addingName)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-left text-[13px] hover:opacity-80"
                      style={{ color: "var(--color-tab-active)" }}
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      Create &ldquo;{addingName}&rdquo;
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => handleAddMaterial(addingName)}
              disabled={!addingName.trim() || busy === "adding"}
              className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium disabled:opacity-40"
              style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
            >
              {busy === "adding" ? "…" : "Add"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddingName(""); setSuggestions([]); }}
              className="rounded-[6px] px-3 py-1.5 text-[13px] border"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
            >
              Cancel
            </button>
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            Start typing to link an existing material or press Enter to create a new one.
          </p>
        </div>
      )}

      {/* Material list */}
      <div className="overflow-y-auto max-h-[520px]">
        {linked.length === 0 ? (
          <div
            className="py-12 text-center text-[13px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            No materials yet — click &ldquo;Add Material&rdquo; above
          </div>
        ) : (
          linked.map((mat, i) => (
            <div
              key={mat.id}
              className="flex items-center gap-2 px-4 py-2.5 border-b last:border-b-0"
              style={{
                borderColor: "var(--color-border)",
                background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                opacity: mat.is_active ? 1 : 0.5,
              }}
            >
              {editingId === mat.id ? (
                <div className="flex flex-1 gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(mat);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 rounded-[4px] border px-2 py-1 text-[13px] outline-none"
                    style={{ borderColor: "var(--color-accent)", background: "var(--color-bg)", color: "var(--color-text-primary)" }}
                  />
                  <button
                    onClick={() => handleSaveEdit(mat)}
                    className="rounded px-2 py-1 text-[12px] font-medium"
                    style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded px-2 py-1 text-[12px] border"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                    {mat.name}
                  </span>
                  {/* Active toggle */}
                  <button
                    onClick={() => handleToggleActive(mat)}
                    title={mat.is_active ? "Active" : "Inactive"}
                    className="rounded-full transition-colors"
                    style={{
                      width: 28, height: 16,
                      background: mat.is_active ? "var(--color-success)" : "var(--color-border)",
                      position: "relative", flexShrink: 0,
                    }}
                  >
                    <span
                      className="absolute top-0.5 rounded-full bg-white transition-all"
                      style={{ width: 12, height: 12, left: mat.is_active ? 14 : 2 }}
                    />
                  </button>
                  {/* Edit name */}
                  <button
                    onClick={() => { setEditingId(mat.id); setEditName(mat.name); }}
                    className="p-1 rounded hover:opacity-70"
                    style={{ color: "var(--color-text-muted)" }}
                    title="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {/* Remove from this product */}
                  <button
                    onClick={() => setConfirmRemove(mat)}
                    disabled={busy === mat.id}
                    className="p-1 rounded hover:opacity-70 disabled:opacity-40"
                    style={{ color: "var(--color-text-muted)" }}
                    title="Remove from this product"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {/* Delete from library entirely */}
                  <button
                    onClick={() => setConfirmDelete(mat)}
                    className="p-1 rounded hover:opacity-70"
                    style={{ color: "var(--color-danger)" }}
                    title="Delete material entirely"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title={`Remove "${confirmRemove.name}" from ${product.name}?`}
          message="This only removes the material from this product. The material stays available for other products."
          onConfirm={() => handleRemoveFromProduct(confirmRemove)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.name}" permanently?`}
          message="This removes the material from ALL products and the library. If it has been used in any quotes or orders, deletion will be blocked — deactivate it instead."
          onConfirm={() => handleDeleteMaterial(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ProductsSection() {
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Product list controls
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrintType, setNewPrintType] = useState<"Roll" | "Sheet" | "Unit">("Sheet");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrintType, setEditPrintType] = useState<"Roll" | "Sheet" | "Unit">("Sheet");
  const [confirmDelete, setConfirmDelete] = useState<ProductType | null>(null);

  // Drag-to-reorder state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => setToast({ message, type }),
    []
  );

  const reload = useCallback(async () => {
    const [ptRes, matRes] = await Promise.all([
      fetch("/api/admin/product-types"),
      fetch("/api/admin/materials"),
    ]);
    const [ptData, matData] = await Promise.all([ptRes.json(), matRes.json()]);
    const pts: ProductType[] = ptData.product_types ?? [];
    setProductTypes(pts);
    setGroups(matData.groups ?? []);
    setLoading(false);
    setSelectedId((prev) => prev ?? pts[0]?.id ?? null);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const selected = productTypes.find((p) => p.id === selectedId) ?? null;
  const allMaterials = groups.flatMap((g) => g.materials);

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const res = await fetch("/api/admin/product-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: slug,
        name: newName.trim(),
        default_print_type: newPrintType,
        sort_order: productTypes.length * 10,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { showToast(data.error, "error"); return; }
    showToast(`"${newName.trim()}" added`, "success");
    setAdding(false); setNewName(""); setNewPrintType("Sheet");
    reload();
  }

  async function handleSaveEdit(pt: ProductType) {
    setSaving(true);
    const res = await fetch(`/api/admin/product-types/${pt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), default_print_type: editPrintType }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { showToast(data.error, "error"); return; }
    showToast("Saved", "success");
    setEditingId(null);
    reload();
  }

  async function handleToggleActive(pt: ProductType) {
    const res = await fetch(`/api/admin/product-types/${pt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !pt.is_active }),
    });
    if (!res.ok) { showToast("Failed to update", "error"); return; }
    reload();
  }

  async function handleDeleteProduct(pt: ProductType) {
    const res = await fetch(`/api/admin/product-types/${pt.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, "error"); setConfirmDelete(null); return; }
    showToast(`"${pt.name}" deleted`, "success");
    setConfirmDelete(null);
    if (selectedId === pt.id) setSelectedId(productTypes.find((p) => p.id !== pt.id)?.id ?? null);
    reload();
  }

  async function handleReorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const reordered = [...productTypes];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    // Optimistic update — feels instant
    setProductTypes(reordered);
    // Persist new sort_orders for all items
    await Promise.all(
      reordered.map((pt, idx) =>
        fetch(`/api/admin/product-types/${pt.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: idx * 10 }),
        })
      )
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 rounded-[10px] animate-pulse"
            style={{ background: "var(--color-row-alt)" }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* ── Left: product list ── */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        <button
          onClick={() => { setAdding(true); setNewName(""); setNewPrintType("Sheet"); }}
          className="flex items-center gap-2 rounded-[6px] px-3 py-2 text-[13px] font-medium w-full"
          style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>

        {adding && (
          <div
            className="rounded-[10px] p-3 flex flex-col gap-2 border"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-accent)" }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Product name…"
              className="w-full rounded-[6px] border px-3 py-1.5 text-[13px] outline-none"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)" }}
            />
            <div className="flex gap-2">
              {(["Sheet", "Roll", "Unit"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setNewPrintType(t)}
                  className="flex-1 rounded-[6px] py-1 text-[12px] font-medium border"
                  style={
                    newPrintType === t
                      ? { background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)", borderColor: "var(--color-btn-verify-bg)" }
                      : { borderColor: "var(--color-border)", color: "var(--color-text-muted)" }
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={saving || !newName.trim()}
                className="flex-1 rounded-[6px] py-1.5 text-[12px] font-medium disabled:opacity-40"
                style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
              >
                {saving ? "Saving…" : "Add"}
              </button>
              <button
                onClick={() => setAdding(false)}
                className="rounded-[6px] px-3 py-1.5 text-[12px] border"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div
          className="rounded-[10px] border overflow-hidden"
          style={{ borderColor: "var(--color-border)" }}
        >
          {productTypes.map((pt, i) => {
            const isSelected = selectedId === pt.id;
            const isEditing = editingId === pt.id;
            const isDragging = dragIndex === i;
            const isDropTarget = dragOverIndex === i && dragIndex !== null && dragIndex !== i;
            return (
              <div
                key={pt.id}
                draggable={!isEditing}
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverIndex !== i) setDragOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) handleReorder(dragIndex, i);
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onClick={() => { if (!isEditing) setSelectedId(pt.id); }}
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                style={{
                  background: isSelected
                    ? "var(--color-row-hover)"
                    : i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                  borderBottom: i < productTypes.length - 1 ? "1px solid var(--color-border)" : undefined,
                  opacity: isDragging ? 0.4 : pt.is_active ? 1 : 0.5,
                  borderTop: isDropTarget ? "2px solid var(--color-accent)" : undefined,
                  transition: "opacity 0.15s",
                }}
              >
                {isEditing ? (
                  <div className="flex-1 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit(pt);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full rounded-[4px] border px-2 py-1 text-[12px] outline-none"
                      style={{ borderColor: "var(--color-accent)", background: "var(--color-bg)", color: "var(--color-text-primary)" }}
                    />
                    <div className="flex gap-1">
                      {(["Sheet", "Roll", "Unit"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setEditPrintType(t)}
                          className="flex-1 rounded py-0.5 text-[11px] font-medium border"
                          style={
                            editPrintType === t
                              ? { background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)", borderColor: "var(--color-btn-verify-bg)" }
                              : { borderColor: "var(--color-border)", color: "var(--color-text-muted)" }
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleSaveEdit(pt)}
                        disabled={saving}
                        className="flex-1 rounded py-0.5 text-[11px] font-medium disabled:opacity-40"
                        style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                      >
                        {saving ? "…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded px-2 py-0.5 text-[11px] border"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Drag handle */}
                    <GripVertical
                      className="h-3.5 w-3.5 shrink-0 cursor-grab active:cursor-grabbing"
                      style={{ color: "var(--color-text-muted)", opacity: 0.5 }}
                    />
                    {isSelected && (
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: "var(--color-tab-active)" }}
                      />
                    )}
                    <span
                      className="flex-1 text-[13px] truncate"
                      style={{ color: isSelected ? "var(--color-tab-active)" : "var(--color-text-primary)" }}
                    >
                      {pt.name}
                    </span>
                    <PrintTypePill type={pt.default_print_type} />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleActive(pt); }}
                      className="rounded-full transition-colors"
                      style={{
                        width: 28, height: 16,
                        background: pt.is_active ? "var(--color-success)" : "var(--color-border)",
                        position: "relative", flexShrink: 0,
                      }}
                    >
                      <span
                        className="absolute top-0.5 rounded-full bg-white transition-all"
                        style={{ width: 12, height: 12, left: pt.is_active ? 14 : 2 }}
                      />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingId(pt.id); setEditName(pt.name); setEditPrintType(pt.default_print_type); }}
                      className="p-1 rounded hover:opacity-70"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(pt); }}
                      className="p-1 rounded hover:opacity-70"
                      style={{ color: "var(--color-danger)" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: materials for selected product ── */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div
            className="h-48 flex items-center justify-center rounded-[10px] border text-[13px]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            Select a product to manage its materials
          </div>
        ) : (
          <MaterialPanel
            key={selected.id}
            product={selected}
            allMaterials={allMaterials}
            onReload={reload}
            showToast={showToast}
          />
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.name}"?`}
          message="This removes the product and all its material links. If it has been used in any quotes or orders, deletion will be blocked — deactivate it instead."
          onConfirm={() => handleDeleteProduct(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
