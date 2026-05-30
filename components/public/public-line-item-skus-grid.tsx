"use client";

import { useEffect, useState } from "react";
import { Download, FileText, ExternalLink } from "lucide-react";
import type { TicketFileMeta } from "@/lib/utils/ticket-line-items";
import type { TicketLineDisplayRow } from "@/lib/utils/ticket-line-items";
import { formatTicketLineVariantLabel } from "@/lib/utils/format-ticket-line-variants";

export type PublicSkuGridItem = {
  label: string;
  file?: TicketFileMeta | null;
};

/** Build grid rows for additional SKUs (or line attachment when no SKUs). */
export function publicSkuGridItems(sku: TicketLineDisplayRow): PublicSkuGridItem[] {
  const variants = sku.variants ?? [];
  if (variants.length > 0) {
    return variants.map((v, i) => ({
      label: formatTicketLineVariantLabel(
        { name: v.name, quantity: v.quantity },
        i + 1,
      ),
      file: v.file ?? null,
    }));
  }
  if (sku.lineFile?.id) {
    return [{ label: "Line attachment", file: sku.lineFile }];
  }
  return [];
}

function publicFileUrl(token: string, fileId: string, download = false): string {
  const base = `/api/public/quotes/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}`;
  return download ? `${base}?download=1` : base;
}

const actionLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  color: "#1B2B4B",
};

function FileActions({
  token,
  file,
}: {
  token: string;
  file: TicketFileMeta;
}) {
  const previewUrl = publicFileUrl(token, file.id);
  const downloadUrl = publicFileUrl(token, file.id, true);
  const isPdf = file.mime_type === "application/pdf";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {isPdf && (
        <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={actionLinkStyle}>
          <ExternalLink size={14} />
          Open PDF
        </a>
      )}
      <a href={downloadUrl} style={actionLinkStyle}>
        <Download size={14} />
        Download
      </a>
    </div>
  );
}

/** Fetch PDF via API then preview with a blob: URL (avoids frame-ancestors on the HTTP response). */
function PublicPdfPreview({ previewUrl, fileName }: { previewUrl: string; fileName: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    fetch(previewUrl)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load PDF");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewUrl]);

  const frameStyle: React.CSSProperties = {
    width: "100%",
    height: 220,
    border: "1px solid #E5E7EB",
    borderRadius: 6,
    background: "#F8F9FA",
  };

  if (failed) {
    return (
      <div
        style={{
          ...frameStyle,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          color: "#6B7280",
          fontSize: 12,
        }}
      >
        <FileText size={28} style={{ opacity: 0.45 }} />
        <span>Preview unavailable — use Open PDF or Download</span>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div
        style={{
          ...frameStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6B7280",
          fontSize: 12,
        }}
      >
        Loading preview…
      </div>
    );
  }

  return (
    <object
      data={`${blobUrl}#toolbar=0&navpanes=0`}
      type="application/pdf"
      title={fileName}
      style={frameStyle}
    >
      <p style={{ padding: 12, fontSize: 12, color: "#6B7280", margin: 0 }}>
        PDF preview is not supported in this browser — use Open PDF or Download.
      </p>
    </object>
  );
}

function SkuMedia({ token, file }: { token: string; file: TicketFileMeta }) {
  const previewUrl = publicFileUrl(token, file.id);
  const isPdf = file.mime_type === "application/pdf";
  const isImage = file.mime_type?.startsWith("image/");

  if (isImage) {
    return (
      <div style={{ marginTop: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={file.file_name}
          style={{
            width: "100%",
            maxHeight: 220,
            objectFit: "contain",
            borderRadius: 6,
            border: "1px solid #E5E7EB",
            background: "#F8F9FA",
          }}
        />
        <FileActions token={token} file={file} />
      </div>
    );
  }

  if (isPdf) {
    return (
      <div style={{ marginTop: 8 }}>
        <PublicPdfPreview previewUrl={previewUrl} fileName={file.file_name} />
        <FileActions token={token} file={file} />
      </div>
    );
  }

  return <FileActions token={token} file={file} />;
}

const BORDER = "#E5E7EB";
const NAVY = "#1B2B4B";
const MUTED = "#6B7280";

export function PublicLineItemSkusGrid({
  token,
  items,
}: {
  token: string;
  items: PublicSkuGridItem[];
}) {
  if (!items.length) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 12,
        marginTop: 10,
      }}
    >
      {items.map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          style={{
            padding: 12,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            background: "#FAFAFA",
            minWidth: 0,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: NAVY, lineHeight: 1.4 }}>
            {item.label}
          </p>
          {item.file?.id ? (
            <SkuMedia token={token} file={item.file} />
          ) : (
            <p style={{ margin: "8px 0 0", fontSize: 11, color: MUTED, fontStyle: "italic" }}>
              No attachment
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
