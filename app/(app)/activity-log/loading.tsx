import { TableDivSkeleton } from "@/components/ui/table-skeleton";
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-7 w-40 rounded animate-pulse" style={{ background: "var(--color-border)" }} />
      <TableDivSkeleton cols={8} />
    </div>
  );
}