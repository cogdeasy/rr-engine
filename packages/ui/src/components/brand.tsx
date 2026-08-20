import * as React from "react";
import { cn } from "../utils";

/**
 * The Rolls-Royce badge: ROLLS / double-R monogram / ROYCE, white on brand blue
 * inside a rounded keyline. Drawn as vector so it stays crisp at nav sizes.
 */
export function RrMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 350 566"
      width={size}
      height={size * (566 / 350)}
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Rolls-Royce"
    >
      <rect x="0" y="0" width="350" height="566" rx="46" fill="#10069F" />
      <rect x="14" y="14" width="322" height="538" rx="34" fill="none" stroke="#ffffff" strokeWidth="13" />
      <rect x="14" y="104" width="322" height="13" fill="#ffffff" />
      <rect x="14" y="449" width="322" height="13" fill="#ffffff" />
      <text
        x="175"
        y="82"
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="72"
        fontWeight="700"
        letterSpacing="6"
      >
        ROLLS
      </text>
      <text
        x="175"
        y="408"
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="330"
        fontWeight="700"
        letterSpacing="-46"
      >
        RR
      </text>
      <text
        x="175"
        y="527"
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="72"
        fontWeight="700"
        letterSpacing="6"
      >
        ROYCE
      </text>
    </svg>
  );
}

export function BrandLockup({
  productName = "Engine Health & MRO",
  tone = "light",
  className,
}: {
  productName?: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <RrMark size={26} />
      <span className="flex flex-col leading-tight">
        <span className={cn("text-sm font-semibold tracking-tight", tone === "light" ? "text-rr-ink" : "text-white")}>Rolls-Royce</span>
        <span className={cn("text-[11px]", tone === "light" ? "text-rr-slate" : "text-rr-cloud")}>{productName}</span>
      </span>
    </span>
  );
}
