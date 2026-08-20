import { Button, Panel, StatusPill, cn, formatNumber, statusStyles } from "@rr/ui";
import { settingsSnapshot, thresholdImpact } from "@rr/data";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";

export const metadata = { title: "Settings & access" };

export default function SettingsPage() {
  const snapshot = settingsSnapshot();
  const { accessSummary: access, actions, health, thresholds, escalations } = snapshot;

  const governedAssessments = thresholds.reduce(
    (acc, policy) => {
      const impact = thresholdImpact(policy.values, policy.amber, policy.red, policy.direction);
      acc.red += impact.red;
      acc.amber += impact.amber;
      acc.total += impact.total;
      return acc;
    },
    { red: 0, amber: 0, total: 0 },
  );

  const breachedAlerts = escalations.reduce((sum, policy) => sum + policy.breachedCount, 0);
  const degradedFeeds = health.integrations.filter((i) => i.status !== "green").length;
  const redActions = actions.filter((a) => a.status === "red");

  return (
    <div className="space-y-7">
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Platform · Settings &amp; access</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {redActions.length > 0
                ? `${redActions.length} governance exception${redActions.length > 1 ? "s" : ""} require action`
                : "Access and alerting governance is clean"}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Who can act on what, and at which thresholds we alert. {formatNumber(access.users)} accounts hold access to
              the managed fleet and {thresholds.length} published limits decide what turns red for every other module on
              the platform.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#governance-actions"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Work {actions.length} recommended actions
                <span aria-hidden>›</span>
              </a>
              <a
                href="#settings-workspace"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Review thresholds
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat
              label="Access exceptions"
              value={access.flagged}
              tone={access.flagged > 0 ? "red" : "green"}
              caption="accounts to suspend or recertify"
            />
            <HeroStat
              label="SLA breaches"
              value={breachedAlerts}
              tone={breachedAlerts > 0 ? "red" : "green"}
              caption="alerts past acknowledgement"
            />
            <HeroStat
              label="Feeds degraded"
              value={degradedFeeds}
              tone={degradedFeeds > 0 ? "amber" : "green"}
              caption="integrations behind schedule"
            />
            <HeroStat
              label="Red assessments"
              value={governedAssessments.red}
              tone={governedAssessments.red > 0 ? "amber" : "green"}
              caption={`of ${formatNumber(governedAssessments.total)} governed by these limits`}
            />
          </div>
        </div>
      </section>

      <section id="governance-actions" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="rr-label text-rr-blue">Recommended action</p>
            <h2 className="mt-1 text-lg font-semibold text-rr-ink">What to fix before the next access audit</h2>
          </div>
          <p className="text-xs text-rr-slate">
            Every item is derived from live account, alert and feed state — nothing here is advisory only.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {actions.map((action) => (
            <Panel key={action.id} className={cn("flex flex-col gap-3 border-l-2", statusStyles[action.status].border.replace("border-", "border-l-"))}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold leading-snug text-rr-ink">{action.title}</p>
                <StatusPill status={action.status} />
              </div>
              <p className="text-xs leading-relaxed text-rr-slate">{action.detail}</p>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-rr-ink/8 pt-3">
                <span className="rr-label text-rr-slate">Owner · {action.owner.replace("-", " ")}</span>
                <Button variant={action.status === "red" ? "primary" : "secondary"} size="sm">
                  {action.ctaLabel}
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      <section id="settings-workspace">
        <SettingsWorkspace snapshot={snapshot} />
      </section>
    </div>
  );
}

function HeroStat({ label, value, tone, caption }: { label: string; value: number; tone: "red" | "amber" | "green"; caption: string }) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
  return (
    <div>
      <p className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", colour)}>{value}</p>
      <p className="max-w-[9rem] text-[11px] leading-snug text-rr-cloud/70">{caption}</p>
    </div>
  );
}
