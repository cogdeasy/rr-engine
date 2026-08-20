import Link from "next/link";
import { notFound } from "next/navigation";
import { engineDossier, getDataset } from "@rr/data";
import { Badge, Button, Panel, StatusPill, cn, formatNumber, statusStyles } from "@rr/ui";
import { DossierTabs } from "@/components/engine-detail/dossier-tabs";
import { EngineTwin } from "@/components/engine-detail/engine-twin";

export const metadata = { title: "Engine detail & 3D twin" };

/** Pre-render the deterministic fleet so the dossier is static at build time. */
export function generateStaticParams() {
  return getDataset().engines.map((engine) => ({ engineId: engine.id }));
}

export default async function Page({ params }: { params: Promise<{ engineId: string }> }) {
  const { engineId } = await params;
  const dossier = engineDossier(engineId);
  if (!dossier) notFound();

  const { engine, operator, aircraft, recommendedAction, modules, twin } = dossier;
  const openAlerts = dossier.alerts.filter((a) => a.state !== "closed" && a.state !== "false-positive");
  const redModules = modules.filter((m) => m.status === "red");
  const amberModules = modules.filter((m) => m.status === "amber");
  const actionTone = statusStyles[recommendedAction.status];

  return (
    <div className="space-y-6">
      {/* Header ---------------------------------------------------- */}
      <Panel tone="dark" className="rr-hero-gradient border-0">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="rr-label text-rr-blue-200">Operate · engine dossier</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="rr-numeric text-3xl font-semibold tracking-tight">{engine.esn}</h1>
              <StatusPill status={engine.status} size="md" />
              <Badge variant="outline" className="border-white/30 text-white/80">
                {engine.family}
              </Badge>
            </div>
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <HeaderFact label="Operator" value={operator ? `${operator.name} (${operator.code})` : "Unassigned"} />
              <HeaderFact
                label="Aircraft"
                value={
                  aircraft ? (
                    <Link href={`/fleet?tail=${aircraft.tail}`} className="underline-offset-4 hover:underline">
                      {aircraft.tail} · {aircraft.type}
                    </Link>
                  ) : (
                    "Off-wing"
                  )
                }
              />
              <HeaderFact label="Position" value={engine.position ? `#${engine.position}` : "—"} />
              <HeaderFact label="Location" value={engine.location} />
              <HeaderFact label="Build standard" value={engine.buildStandard} />
            </dl>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex gap-6 text-right">
              <HeroMetric label="EGT margin" value={engine.egtMargin} unit="°C" />
              <HeroMetric label="Health score" value={engine.healthScore} />
              <HeroMetric label="RUL" value={formatNumber(engine.rulCycles)} unit="cyc" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="onDark" size="sm">
                Export dossier
              </Button>
              <Link href="/alerts">
                <Button variant="onDark" size="sm">
                  {openAlerts.length} open alert{openAlerts.length === 1 ? "" : "s"}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Panel>

      {/* Decision -------------------------------------------------- */}
      <Panel className={cn("flex flex-wrap items-center justify-between gap-5 border-l-4", actionTone.bg, actionTone.border)}>
        <div className="flex min-w-0 items-start gap-4">
          <StatusPill status={recommendedAction.status} size="md" />
          <div className="min-w-0">
            <p className="rr-label text-rr-slate">Recommended action</p>
            <p className="mt-1 text-lg font-semibold leading-snug text-rr-ink">{recommendedAction.headline}</p>
            <p className="mt-1 text-sm leading-relaxed text-rr-slate">{recommendedAction.detail}</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          {recommendedAction.dueInHours !== null ? (
            <div className="text-right">
              <p className="rr-label text-rr-slate">Due within</p>
              <p className={cn("rr-numeric text-3xl font-semibold", actionTone.text)}>
                {recommendedAction.dueInHours}
                <span className="ml-1 text-sm font-medium text-rr-slate">h</span>
              </p>
            </div>
          ) : null}
          <Button variant={recommendedAction.status === "red" ? "danger" : "primary"}>{recommendedAction.cta}</Button>
        </div>
      </Panel>

      {/* Why is it red --------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-rr-slate">
        <span className="rr-label text-rr-slate">Drivers</span>
        {redModules.length + amberModules.length === 0 ? (
          <span>All {modules.length} modules within limits.</span>
        ) : (
          [...redModules, ...amberModules].map((module) => (
            <span key={module.code} className="inline-flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", statusStyles[module.status].dot)} aria-hidden />
              <span className="font-medium text-rr-ink">{module.label}</span>
              <span className="text-rr-slate">{module.reason}</span>
            </span>
          ))
        )}
      </div>

      {/* Twin ------------------------------------------------------ */}
      <EngineTwin asset={twin} modules={modules} esn={engine.esn} />

      {/* Tabs ------------------------------------------------------ */}
      <DossierTabs dossier={dossier} />
    </div>
  );
}

function HeaderFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="rr-label text-rr-blue-200">{label}</dt>
      <dd className="mt-1 text-white/90">{value}</dd>
    </div>
  );
}

function HeroMetric({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div>
      <p className="rr-label text-rr-blue-200">{label}</p>
      <p className="rr-numeric mt-1 text-3xl font-semibold">
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-white/60">{unit}</span> : null}
      </p>
    </div>
  );
}
