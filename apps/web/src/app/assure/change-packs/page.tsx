import Link from "next/link";
import { changePacks, changePackSummary } from "@rr/data";
import { Panel, PanelHeader, ProgressBar, StatTile, StatusPill, formatNumber } from "@rr/ui";
import { ChangePackBoard } from "@/components/change-packs/change-pack-board";

export const metadata = { title: "DN change packs" };

export default function ChangePacksPage() {
  const summary = changePackSummary();
  const packs = changePacks();
  const heldAtGate = packs.filter((pack) => pack.gates.some((gate) => gate.state === "blocked"));

  return (
    <div className="space-y-7">
      {/* Decision-first hero */}
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Assure · DN change-pack lifecycle</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.blocked} change packs are held at a gate
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Every analytic change walks the same end-to-end process — Design, Build, Release — and cannot pass a gate until its
              Definition of Done is closed out. {summary.awaitingGate} packs are in review now and {summary.pastTarget} are past
              their production target.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#board"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Work the blocked packs
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/assure/audit"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Gate decisions in the audit trail
              </Link>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-10 gap-y-5 sm:grid-cols-4">
            {[
              { label: "In flight", value: formatNumber(summary.packs), note: "live change packs" },
              { label: "Blocked", value: formatNumber(summary.blocked), note: "gate cannot pass" },
              { label: "Mean DoD", value: `${summary.meanDodPct}%`, note: "activities closed" },
              { label: "PIR findings", value: formatNumber(summary.openPirFindings), note: "open in production" },
            ].map((item) => (
              <div key={item.label}>
                <dt className="rr-label text-rr-blue-200">{item.label}</dt>
                <dd className="rr-numeric mt-1 text-3xl font-semibold leading-none">{item.value}</dd>
                <p className="mt-1 text-[11px] text-rr-cloud">{item.note}</p>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Stage funnel */}
      <section className="grid gap-4 lg:grid-cols-3">
        {summary.stages.map((stage) => (
          <StatTile
            key={stage.stage}
            label={stage.label}
            value={formatNumber(stage.packs)}
            unit="packs"
            status={stage.blocked > 0 ? "red" : stage.atRisk > 0 ? "amber" : "green"}
            caption={`${stage.blocked} blocked · ${stage.atRisk} at risk · ${stage.meanDaysInStage}d mean age`}
          />
        ))}
      </section>

      {/* Definition of Done by area */}
      <Panel>
        <PanelHeader
          title="Definition of Done by area"
          subtitle="Completion across every live pack, in the order the process works them"
        />
        <div className="grid gap-5 md:grid-cols-5">
          {summary.areas.map((area) => (
            <div key={area.area}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="rr-label text-rr-slate">{area.label}</p>
              </div>
              <p className="rr-numeric mt-2 text-3xl font-semibold leading-none text-rr-ink">{area.completePct}%</p>
              <ProgressBar className="mt-3" value={area.completePct} status={area.status} />
              <p className="mt-2 text-[11px] text-rr-slate">
                {formatNumber(area.complete)} of {formatNumber(area.activities)} activities · {area.packs} packs held here
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {/* Blocked register */}
      {heldAtGate.length > 0 ? (
        <Panel>
          <PanelHeader title="Held at a gate" subtitle="Each of these needs a named decision before it can move" />
          <ul className="divide-y divide-rr-ink/8">
            {heldAtGate.map((pack) => {
              const blocked = pack.gates.find((gate) => gate.state === "blocked");
              return (
                <li key={pack.id} className="flex flex-wrap items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rr-numeric text-sm font-semibold text-rr-ink">{pack.ref}</span>
                      <StatusPill status={pack.status}>{pack.stage}</StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-rr-ink">{pack.title}</p>
                    <p className="mt-0.5 text-xs text-rr-slate">{blocked?.blockedReason}</p>
                  </div>
                  <div className="text-right">
                    <p className="rr-label text-rr-slate">Owner</p>
                    <p className="text-xs text-rr-ink">{pack.owner}</p>
                    <p className="mt-1 text-[11px] text-rr-slate">RED TEAM · {pack.redTeamOwner}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <section id="board" className="scroll-mt-24">
        <ChangePackBoard packs={packs} />
      </section>
    </div>
  );
}
