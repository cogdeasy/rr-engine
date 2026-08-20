import * as React from "react";
import { cn } from "../utils";

/**
 * Double-R monogram mark, drawn to echo the Rolls-Royce badge lock-up used on
 * rolls-royce.com: white rules on the brand blue, wordmark above and below.
 */
export function RrMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center bg-rr-blue text-white", className)}
      style={{ width: size, height: size * 1.24 }}
      aria-hidden
    >
      <span className="flex h-full w-full flex-col items-center justify-between px-[6%] py-[7%]">
        <span className="w-full border-b border-white/90 pb-[2px] text-center font-semibold leading-none" style={{ fontSize: size * 0.19 }}>
          ROLLS
        </span>
        <span className="font-semibold leading-none tracking-tighter" style={{ fontSize: size * 0.52 }}>
          RR
        </span>
        <span className="w-full border-t border-white/90 pt-[2px] text-center font-semibold leading-none" style={{ fontSize: size * 0.19 }}>
          ROYCE
        </span>
      </span>
    </span>
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
      <RrMark size={28} />
      <span className="flex flex-col leading-tight">
        <span className={cn("text-sm font-semibold tracking-tight", tone === "light" ? "text-rr-ink" : "text-white")}>Rolls-Royce</span>
        <span className={cn("text-[11px]", tone === "light" ? "text-rr-slate" : "text-rr-cloud")}>{productName}</span>
      </span>
    </span>
  );
}
