"use client";

import { useEffect, useState } from "react";

export type LazyBlurImageProps = {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  /** Full-bleed cover inside a sized or fill parent (line-item thumbnails). */
  fill?: boolean;
  loading?: "lazy" | "eager";
  onLoad?: () => void;
  onError?: () => void;
};

/**
 * Image that shows a shimmer placeholder and blurred preview until `onLoad`,
 * then transitions to sharp. Used for ticket line attachments and previews.
 */
export function LazyBlurImage({
  src,
  alt,
  className = "",
  style,
  fill = false,
  loading = "lazy",
  onLoad,
  onError,
}: LazyBlurImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  const wrapperCls = fill
    ? "relative block w-full h-full overflow-hidden"
    : "relative inline-block overflow-hidden";

  const imgCls = [
    fill ? "block w-full h-full object-cover" : className,
    "transition-[filter,opacity,transform] duration-300 ease-out motion-reduce:transition-none motion-reduce:blur-none",
    loaded ? "blur-0 opacity-100 scale-100" : "blur-lg opacity-80 scale-[1.03]",
    failed ? "opacity-0" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={wrapperCls}>
      {!loaded && !failed && (
        <span
          className="absolute inset-0 skeleton"
          style={{ background: "var(--color-row-alt)" }}
          aria-hidden
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => {
          setLoaded(true);
          onLoad?.();
        }}
        onError={() => {
          setFailed(true);
          onError?.();
        }}
        className={imgCls}
        style={style}
      />
    </span>
  );
}
