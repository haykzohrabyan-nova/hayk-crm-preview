import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-4"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="text-center space-y-2">
        <p
          className="text-[72px] font-semibold leading-none"
          style={{ color: "var(--color-accent)" }}
        >
          404
        </p>
        <h1
          className="text-[20px] font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Page not found
        </h1>
        <p className="text-[14px]" style={{ color: "var(--color-text-muted)" }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex items-center rounded-[6px] px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-80"
        style={{
          background: "var(--color-btn-primary-bg)",
          color: "var(--color-btn-primary-text)",
        }}
      >
        Go to home
      </Link>
    </div>
  );
}
