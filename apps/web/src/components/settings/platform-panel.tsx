import { Badge, Panel, PanelHeader, StatTile, StatusPill, cn, formatDateTime, formatNumber, relativeTime } from "@rr/ui";
import type { PlatformHealth } from "@rr/types";

function formatAge(minutes: number): string {
  if (minutes < 90) return `${minutes}m`;
  if (minutes < 2880) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export function PlatformPanel({ health }: { health: PlatformHealth }) {
  const stale = health.freshness.filter((f) => f.status !== "green");
  const degraded = health.integrations.filter((i) => i.status !== "green");
  const records = health.freshness.reduce((sum, f) => sum + f.records, 0);
  const topModels = health.models.slice(0, 8);
  const remainingModels = health.models.length - topModels.length;
  const remainingEngines = health.models.slice(8).reduce((sum, m) => sum + m.enginesCovered, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Feeds behind schedule"
          value={stale.length}
          status={stale.some((f) => f.status === "red") ? "red" : stale.length > 0 ? "amber" : "green"}
          caption={`of ${health.freshness.length} monitored datasets`}
        />
        <StatTile
          label="Integrations degraded"
          value={degraded.length}
          status={degraded.some((i) => i.status === "red") ? "red" : degraded.length > 0 ? "amber" : "green"}
          caption={`of ${health.integrations.length} connected systems`}
        />
        <StatTile label="Active model versions" value={health.models.length} caption="Prognostic scoring in production" />
        <StatTile label="Records in scope" value={formatNumber(records)} caption={`Dataset seed ${health.datasetSeed}`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Data freshness"
            subtitle="Age of each dataset against the interval the platform expects. Amber past 1.5×, red past 3×."
          />
          <ul className="space-y-3">
            {health.freshness.map((item) => {
              const ratio = Math.min(1, item.ageMinutes / (item.expectedIntervalMinutes * 3));
              return (
                <li key={item.id} className="flex items-center gap-4">
                  <div className="w-52 shrink-0">
                    <p className="text-[13px] font-medium text-rr-ink">{item.label}</p>
                    <p className="rr-numeric text-[11px] text-rr-slate">
                      {formatNumber(item.records)} records · expected every {formatAge(item.expectedIntervalMinutes)}
                    </p>
                  </div>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rr-mist">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        item.status === "red" ? "bg-status-red" : item.status === "amber" ? "bg-status-amber" : "bg-status-green",
                      )}
                      style={{ width: `${Math.max(4, ratio * 100)}%` }}
                    />
                  </div>
                  <div className="w-32 shrink-0 text-right">
                    <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{formatAge(item.ageMinutes)} old</p>
                    <p className="rr-numeric text-[11px] text-rr-slate">{formatDateTime(item.lastUpdatedAt)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader
            title="Model versions"
            subtitle="Widest-deployed prognostic models scoring the managed fleet tonight."
            actions={<Badge variant="outline">{health.models.length} in production</Badge>}
          />
          <ul className="divide-y divide-rr-ink/8">
            {topModels.map((model) => (
              <li key={model.id} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <div>
                  <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{model.version}</p>
                  <p className="text-[11px] text-rr-slate">
                    {model.name} · {model.scope}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{formatNumber(model.enginesCovered)}</p>
                    <p className="rr-label text-rr-slate">engines</p>
                  </div>
                  <div>
                    <p className="rr-numeric text-[13px] text-rr-ink">{Math.round(model.meanConfidence * 100)}%</p>
                    <p className="rr-label text-rr-slate">confidence</p>
                  </div>
                  <StatusPill status={model.status}>{relativeTime(model.lastScoredAt)}</StatusPill>
                </div>
              </li>
            ))}
          </ul>
          {remainingModels > 0 ? (
            <p className="mt-3 border-t border-rr-ink/8 pt-3 text-[11px] text-rr-slate">
              {remainingModels} further versions cover {formatNumber(remainingEngines)} engines between them — consolidate on
              retirement of the older build standards.
            </p>
          ) : null}
        </Panel>
      </div>

      <Panel padded={false}>
        <div className="p-5 pb-0">
          <PanelHeader
            title="Integration status"
            subtitle="Every system feeding or consuming the platform, with the owning role accountable for the link."
            actions={<Badge variant="outline">Generated {formatDateTime(health.generatedAt)}</Badge>}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-rr-ink/8 bg-rr-mist/60">
                <th scope="col" className="rr-label px-5 py-2.5 text-left text-rr-slate">System</th>
                <th scope="col" className="rr-label px-4 py-2.5 text-left text-rr-slate">Type</th>
                <th scope="col" className="rr-label px-4 py-2.5 text-left text-rr-slate">Flow</th>
                <th scope="col" className="rr-label px-4 py-2.5 text-right text-rr-slate">Volume / day</th>
                <th scope="col" className="rr-label px-4 py-2.5 text-right text-rr-slate">Last sync</th>
                <th scope="col" className="rr-label px-4 py-2.5 text-left text-rr-slate">Owner</th>
                <th scope="col" className="rr-label px-5 py-2.5 text-right text-rr-slate">State</th>
              </tr>
            </thead>
            <tbody>
              {health.integrations.map((integration) => (
                <tr key={integration.id} className="border-b border-rr-ink/5 last:border-0">
                  <td
                    className={cn(
                      "px-5 py-3 border-l-2",
                      integration.status === "red" ? "border-l-status-red" : integration.status === "amber" ? "border-l-status-amber" : "border-l-status-green",
                    )}
                  >
                    <p className="text-[13px] font-semibold text-rr-ink">{integration.name}</p>
                    <p className="text-[11px] text-rr-slate">{integration.note}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-rr-slate">{integration.kind}</td>
                  <td className="px-4 py-3 capitalize text-rr-slate">{integration.direction}</td>
                  <td className="rr-numeric px-4 py-3 text-right text-rr-ink">{formatNumber(integration.volumePerDay)}</td>
                  <td className="rr-numeric px-4 py-3 text-right text-rr-ink">
                    {formatAge(integration.ageMinutes)} ago
                    <span className="block text-[11px] text-rr-slate">expected {formatAge(integration.expectedIntervalMinutes)}</span>
                  </td>
                  <td className="px-4 py-3 capitalize text-rr-slate">{integration.owner.replace("-", " ")}</td>
                  <td className="px-5 py-3 text-right">
                    <StatusPill status={integration.status}>
                      {integration.status === "green" ? "streaming" : integration.status === "amber" ? "lagging" : "stalled"}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
