"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup, StatusDot, cn } from "@rr/ui";
import { MODULE_GROUPS, MODULES } from "@/lib/modules";
import { ModuleIcon } from "./icon";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col border-r border-white/8 bg-rr-ink text-rr-cloud transition-[width]",
          collapsed ? "w-[68px]" : "w-[268px]",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/8 px-4">
          {collapsed ? (
            <Link href="/" aria-label="Rolls-Royce Engine Health home" className="mx-auto">
              <span className="flex h-7 w-6 items-center justify-center bg-rr-blue text-[11px] font-semibold text-white">RR</span>
            </Link>
          ) : (
            <Link href="/">
              <BrandLockup tone="dark" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className={cn("rounded p-1 text-rr-cloud/60 hover:bg-white/5 hover:text-white", collapsed && "hidden")}
          >
            <span aria-hidden>‹</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {MODULE_GROUPS.map((group) => {
            const modules = MODULES.filter((m) => m.group === group.id);
            if (modules.length === 0) return null;
            return (
              <div key={group.id} className="mb-5">
                {!collapsed ? <p className="rr-label px-3 pb-2 text-rr-cloud/40">{group.label}</p> : null}
                <ul className="space-y-0.5">
                  {modules.map((mod) => {
                    const active = isActive(pathname, mod.href);
                    return (
                      <li key={mod.id}>
                        <Link
                          href={mod.href}
                          title={collapsed ? mod.label : mod.summary}
                          className={cn(
                            "group flex items-center gap-3 rounded px-3 py-2 text-[13px] transition-colors",
                            active ? "bg-rr-blue text-white" : "text-rr-cloud/80 hover:bg-white/6 hover:text-white",
                            collapsed && "justify-center px-0",
                          )}
                        >
                          <ModuleIcon name={mod.icon} className="h-4 w-4 shrink-0" />
                          {!collapsed ? (
                            <span className="flex-1 truncate">{mod.label}</span>
                          ) : null}
                          {!collapsed && !mod.implemented ? (
                            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rr-cloud/70">
                              soon
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand navigation"
            className="border-t border-white/8 py-3 text-rr-cloud/60 hover:text-white"
          >
            ›
          </button>
        ) : (
          <div className="border-t border-white/8 px-4 py-3 text-[11px] text-rr-cloud/50">
            <p>Fleet Services Operations Centre</p>
            <p className="mt-0.5">Derby · Data as at 20 Aug 2026 06:00Z</p>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar pathname={pathname} />
        <main className="flex-1 px-8 py-7">{children}</main>
      </div>
    </div>
  );
}

function TopBar({ pathname }: { pathname: string }) {
  const mod =
    MODULES.filter((m) => isActive(pathname, m.href) && m.href !== "/").sort((a, b) => b.href.length - a.href.length)[0] ??
    MODULES[0];
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-6 border-b border-rr-ink/8 bg-white/90 px-8 backdrop-blur">
      <div className="min-w-0">
        <p className="rr-label text-rr-slate">{MODULE_GROUPS.find((g) => g.id === mod?.group)?.label}</p>
        <h2 className="truncate text-sm font-semibold text-rr-ink">{mod?.label}</h2>
      </div>
      <div className="flex items-center gap-5">
        <div className="hidden items-center gap-4 text-[11px] text-rr-slate lg:flex">
          <span className="inline-flex items-center gap-1.5">
            <StatusDot status="red" /> Red engines
          </span>
          <span className="inline-flex items-center gap-1.5">
            <StatusDot status="amber" /> Watchlist
          </span>
          <span className="inline-flex items-center gap-1.5">
            <StatusDot status="green" /> Nominal
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-right text-[11px] leading-tight text-rr-slate sm:block">
            <span className="block font-semibold text-rr-ink">A. Hughes</span>
            Duty fleet controller
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rr-blue text-[11px] font-semibold text-white">AH</span>
        </div>
      </div>
    </header>
  );
}
