/**
 * Shared table skeleton components used across list pages.
 *
 * TableRowsSkeleton — renders <tr><td> rows; use inside a <tbody>.
 * TableDivSkeleton  — renders <div> rows; use as a standalone block.
 */

export function TableRowsSkeleton({
  rows = 5,
  cols,
}: {
  rows?: number;
  cols: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr
          key={i}
          style={{
            background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
            borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
          }}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-3 py-3">
              <div
                className="h-4 animate-pulse rounded"
                style={{ width: j === 0 ? 120 : 80, background: "var(--color-border)" }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function TableDivSkeleton({
  rows = 5,
  cols,
}: {
  rows?: number;
  cols: number;
}) {
  return (
    <div className="animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-4 rounded flex-1"
              style={{ background: "var(--color-border)" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
