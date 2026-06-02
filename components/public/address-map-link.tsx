"use client";

import type { CSSProperties } from "react";
import {
  companyAddressFull,
  companyAddressLines,
  googleMapsSearchUrl,
  mapLinkStyle,
  publicContactLinkStyle,
  type CompanyAddressFields,
} from "@/lib/utils/maps-link";

/** Address lines that open Google Maps — inherits surrounding text color. */
export function AddressMapLink({
  company,
  lineStyle,
  blockStyle,
}: {
  company: CompanyAddressFields;
  lineStyle?: CSSProperties;
  blockStyle?: CSSProperties;
}) {
  const lines = companyAddressLines(company);
  const href = googleMapsSearchUrl(companyAddressFull(company));

  if (!lines.length) return null;

  if (!href) {
    return (
      <>
        {lines.map((line, i) => (
          <div key={i} style={lineStyle}>{line}</div>
        ))}
      </>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${companyAddressFull(company)} in Google Maps`}
      style={{ ...publicContactLinkStyle, ...blockStyle }}
    >
      {lines.map((line, i) => (
        <div key={i} style={lineStyle}>{line}</div>
      ))}
    </a>
  );
}

/** Single-line address link (e.g. pickup banner). */
export function AddressMapText({
  address,
  style,
}: {
  address: string;
  style?: CSSProperties;
}) {
  const href = googleMapsSearchUrl(address);
  if (!address.trim()) return null;

  if (!href) {
    return <span style={style}>{address}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${address} in Google Maps`}
      style={{ ...mapLinkStyle, ...style }}
    >
      {address}
    </a>
  );
}
