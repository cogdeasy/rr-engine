import Link from "next/link";
import { Panel, SectionHeading, Badge } from "@rr/ui";
import { MODULES, type ModuleDefinition } from "@/lib/modules";
import { ModuleIcon } from "./icon";

/**
 * Standard placeholder for a declared-but-not-yet-built module. Feature
 * branches replace their route's page with the real implementation.
 */
export function ModulePlaceholder({ moduleId }: { moduleId: string }) {
  const mod = MODULES.find((m) => m.id === moduleId);
  if (!mod) return null;
  const siblings = MODULES.filter((m) => m.group === mod.group && m.id !== mod.id).slice(0, 4);

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={mod.group}
        title={mod.label}
        description={mod.summary}
        actions={<Badge variant="brand">In build</Badge>}
      />
      <Panel className="rr-hero-gradient border-0 text-white">
        <div className="flex items-start gap-5 p-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
            <ModuleIcon name={mod.icon} className="h-5 w-5 text-white" />
          </span>
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Decision supported</p>
            <p className="mt-1 text-lg font-medium leading-snug">{mod.decision}</p>
            <p className="mt-3 text-sm text-rr-cloud">
              This module is declared in the platform module registry and is being delivered on its own branch. The
              navigation, data contracts and design system it depends on are already in place.
            </p>
          </div>
        </div>
      </Panel>
      {siblings.length > 0 ? (
        <div>
          <p className="rr-label mb-3 text-rr-slate">Related modules</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {siblings.map((sibling: ModuleDefinition) => (
              <Link key={sibling.id} href={sibling.href} className="rr-panel block p-4 transition-colors hover:border-rr-blue/40">
                <ModuleIcon name={sibling.icon} className="h-4 w-4 text-rr-blue" />
                <p className="mt-3 text-sm font-semibold text-rr-ink">{sibling.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-rr-slate">{sibling.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
