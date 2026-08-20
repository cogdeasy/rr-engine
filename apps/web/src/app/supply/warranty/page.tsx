import Link from "next/link";
import {
  getWarrantyClaims,
  isWarrantyClaimOpen,
  warrantyAgeing,
  warrantyByOperator,
  warrantyCoverLabel,
  warrantyEligibilityCandidates,
  warrantyEventLabel,
  warrantyRecoveryTrend,
  warrantyRejectionBreakdown,
  warrantyRejectionLabel,
  warrantyStateLabel,
  warrantySummary,
} from "@rr/data";
import type {
  WarrantyClaimState,
  WarrantyCoverKind,
  WarrantyEventType,
  WarrantyRejectionReason,
} from "@rr/types";
import {
  Badge,
  Panel,
  PanelHeader,
  SectionHeading,
  StatTile,
  StatusPill,
  ThresholdBar,
  TrendChart,
  cn,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";
import { AgeingChart } from "@/components/warranty/ageing-chart";
import { ClaimRegister } from "@/components/warranty/claim-register";
import { EligibilityChecker } from "@/components/warranty/eligibility-checker";

export const metadata = { title: "Warranty claims" };

const COVER_KINDS: WarrantyCoverKind[] = [
  "new-engine-warranty",
  "parts-warranty",
  "campaign",
  "service-bulletin",
  "totalcare",
  "goodwill",
];
const CLAIM_STATES: WarrantyClaimState[] = ["draft", "submitted", "under-review", "approved", "rejected"];
const EVENT_TYPES: WarrantyEventType[] = [
  "unscheduled-removal",
  "shop-finding",
  "on-wing-repair",
  "component-failure",
  "campaign-embodiment",
];
const REJECTION_REASONS: WarrantyRejectionReason[] = [
  "outside-time-limit",
  "outside-cycle-limit",
  "operator-induced-damage",
  "foreign-object-damage",
  "insufficient-evidence",
  "part-not-covered",
  "unapproved-repair-shop",
  "duplicate-claim",
];

const labelMap = <T extends string>(keys: T[], fn: (key: T) => string): Record<string, string> =>
  Object.fromEntries(keys.map((key) => [key, fn(key)]));

const ACCENT: Record<string, string> = {
  red: "border-status-red",
  amber: "border-status-amber",
  green: "border-status-green",
  grey: "border-status-grey",
};

export default function WarrantyClaimsPage() {
  const claims = getWarrantyClaims();
  const summary = warrantySummary();
  const ageing = warrantyAgeing();
  const rejections = warrantyRejectionBreakdown();
  const byOperator = warrantyByOperator();
  const candidates = warrantyEligibilityCandidates(8);
  const trend = warrantyRecoveryTrend(12);

  const interventions = claims
    .filter(isWarrantyClaimOpen)
    .filter((c) => c.slaBreachDays > 0 || !c.evidenceComplete)
    .sort((a, b) => b.slaBreachDays - a.slaBreachDays || b.claimedUsd - a.claimedUsd)
    .slice(0, 4);

  const stalled = ageing.find((b) => b.id === "180+");
  const recoveryStatus = summary.recoveryRatePct < 45 ? "red" : summary.recoveryRatePct < 65 ? "amber" : "green";

  return (
    <div className="space-y-7">
      {/* Decision-first hero */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Supply · Warranty recovery desk</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {formatUsd(summary.openValueUsd)} of claim value is open across {summary.openClaims} claims
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Every repair is either recoverable under warranty or campaign cover, or it is money the operator carries.
              {summary.slaBreaches > 0
                ? ` ${summary.slaBreaches} claims are past the assessment SLA and need escalating today.`
                : " No claim is past its assessment SLA today."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#claim-register"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Work {summary.slaBreaches + summary.evidenceGaps} claims needing intervention
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="#eligibility"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Check removal eligibility
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Claimed" value={formatUsd(summary.claimedUsd)} caption={`${summary.claims} claims lifetime`} tone="cloud" />
            <HeroStat label="Recovered" value={formatUsd(summary.recoveredUsd)} caption={`${summary.recoveryRatePct}% of settled value`} tone="green" />
            <HeroStat label="Past SLA" value={String(summary.slaBreaches)} caption="escalate today" tone="red" />
            <HeroStat label="Evidence gaps" value={String(summary.evidenceGaps)} caption="blocking submission" tone="amber" />
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Total claimed" value={formatUsd(summary.claimedUsd)} caption={`${formatNumber(summary.claims)} claims against work orders`} />
        <StatTile label="Recovered" value={formatUsd(summary.recoveredUsd)} status="green" caption="Credits agreed and settled" />
        <StatTile
          label="Recovery rate"
          value={`${summary.recoveryRatePct}%`}
          status={recoveryStatus}
          caption="Recovered value / settled claim value"
        />
        <StatTile
          label="Avg settlement"
          value={summary.averageSettlementDays}
          unit="days"
          status={summary.averageSettlementDays > 75 ? "red" : summary.averageSettlementDays > 55 ? "amber" : "green"}
          caption="Submission to decision"
        />
        <StatTile
          label="Open value"
          value={formatUsd(summary.openValueUsd)}
          status={summary.slaBreaches > 0 ? "amber" : "green"}
          caption={`${summary.openClaims} claims awaiting decision`}
        />
      </section>

      {/* Act now + ageing */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Claims needing intervention"
            subtitle="Past the assessment SLA or blocked by an incomplete evidence pack — these are the recoveries at risk"
            actions={<Badge variant="brand">{summary.slaBreaches + summary.evidenceGaps} open</Badge>}
          />
          {interventions.length === 0 ? (
            <p className="py-8 text-center text-xs text-rr-slate">
              No claim is past SLA or missing evidence. The desk is clear.
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {interventions.map((claim) => (
                <li key={claim.id} className={cn("rounded-sm border border-rr-ink/8 border-l-2 p-4", ACCENT[claim.status])}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{claim.reference}</p>
                      <p className="truncate text-[11px] text-rr-slate">
                        {claim.esn} · {claim.operatorName}
                      </p>
                    </div>
                    <StatusPill status={claim.status}>{warrantyStateLabel(claim.state)}</StatusPill>
                  </div>
                  <p className="rr-numeric mt-3 text-2xl font-semibold text-rr-ink">{formatUsd(claim.claimedUsd)}</p>
                  <p className="mt-0.5 text-[11px] text-rr-slate">
                    {warrantyCoverLabel(claim.coverKind)} · {claim.moduleCode} · {claim.ageDays}d old
                    {claim.slaBreachDays > 0 ? (
                      <span className="font-semibold text-status-red"> · {claim.slaBreachDays}d past SLA</span>
                    ) : (
                      <span className="font-semibold text-status-amber"> · evidence incomplete</span>
                    )}
                  </p>
                  <p className="mt-3 border-t border-rr-ink/8 pt-2.5 text-[12px] leading-snug text-rr-ink">
                    <span className="rr-label mr-1.5 text-rr-slate">Do</span>
                    {claim.recommendedAction}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Ageing of open claims"
            subtitle="Claim value by days since the event was raised"
            actions={
              stalled && stalled.count > 0 ? (
                <StatusPill status="red">{formatUsd(stalled.valueUsd)} stalled</StatusPill>
              ) : (
                <StatusPill status="green">Nothing stalled</StatusPill>
              )
            }
          />
          <AgeingChart buckets={ageing} />
          <p className="mt-4 border-t border-rr-ink/8 pt-3 text-[11px] leading-relaxed text-rr-slate">
            Red is claim value older than 180 days: entitlement evidence degrades with age and time-limited cover can
            lapse before the claim is settled.
          </p>
        </Panel>
      </div>

      {/* Eligibility checker */}
      <section id="eligibility" className="space-y-4 scroll-mt-24">
        <SectionHeading
          eyebrow="Eligibility checker"
          title="Is this removal recoverable?"
          description="Assess a removal candidate against the cover in force — hours, cycles and calendar — before the engine is stripped, and see what the entitlement is worth today."
          actions={<Badge variant="brand">{candidates.length} candidates</Badge>}
        />
        <EligibilityChecker candidates={candidates} coverLabels={labelMap(COVER_KINDS, warrantyCoverLabel)} />
      </section>

      {/* Register */}
      <section id="claim-register" className="space-y-4 scroll-mt-24">
        <SectionHeading
          eyebrow="Claim register"
          title="Every claim, its value and where it has stalled"
          description="Filter by state, cover type or intervention need. Select a claim to see the evidence position and the next action."
        />
        <ClaimRegister
          claims={claims}
          coverLabels={labelMap(COVER_KINDS, warrantyCoverLabel)}
          stateLabels={labelMap(CLAIM_STATES, warrantyStateLabel)}
          eventLabels={labelMap(EVENT_TYPES, warrantyEventLabel)}
          rejectionLabels={labelMap(REJECTION_REASONS, warrantyRejectionLabel)}
        />
      </section>

      {/* Rejections, trend, operators */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Why claims are rejected"
            subtitle={`${formatUsd(summary.rejectedValueUsd)} of claimed value declined — each reason has a controllable cause`}
          />
          <ul className="space-y-3">
            {rejections.map((row) => (
              <li key={row.reason} className="flex items-start gap-4">
                <div className="w-52 shrink-0">
                  <p className="text-[13px] font-medium text-rr-ink">{row.label}</p>
                  <p className="text-[11px] text-rr-slate">
                    {row.count} claim{row.count === 1 ? "" : "s"} · {formatUsd(row.valueUsd)}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-rr-mist">
                    <div className="h-full rounded-full bg-status-red" style={{ width: `${row.sharePct}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-rr-slate">{row.mitigation}</p>
                </div>
                <span className="rr-numeric w-12 shrink-0 text-right text-[13px] font-semibold text-rr-ink">{row.sharePct}%</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Recovery rate trend" subtitle="Recovered share of settled value, rolling 90 days" />
          <TrendChart series={trend} height={168} />
          <div className="mt-4 border-t border-rr-ink/8 pt-4">
            <p className="rr-label mb-2 text-rr-slate">Against target</p>
            <ThresholdBar
              value={summary.recoveryRatePct}
              min={0}
              max={100}
              amber={65}
              red={45}
              unit="%"
              direction="lower-is-worse"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-rr-slate">
              Amber below 65%, red below 45%. Recovery below target is usually an evidence problem, not an entitlement
              problem.
            </p>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Recovery by operator"
          subtitle="Where claim value is concentrated and which accounts convert it"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rr-ink/8">
                <th className="rr-label py-2 text-left text-rr-slate">Operator</th>
                <th className="rr-label py-2 text-right text-rr-slate">Claims</th>
                <th className="rr-label py-2 text-right text-rr-slate">Open</th>
                <th className="rr-label py-2 text-right text-rr-slate">Claimed</th>
                <th className="rr-label py-2 text-right text-rr-slate">Recovered</th>
                <th className="rr-label py-2 pr-8 text-right text-rr-slate">Open value</th>
                <th className="rr-label w-56 py-2 text-left text-rr-slate">Recovery rate</th>
              </tr>
            </thead>
            <tbody>
              {byOperator.map((row) => (
                <tr key={row.operatorId} className="border-b border-rr-ink/5 last:border-0">
                  <td className={cn("border-l-2 py-2.5 pl-3", ACCENT[row.status])}>
                    <p className="text-[13px] font-medium text-rr-ink">{row.operator}</p>
                    <p className="text-[11px] text-rr-slate">{row.code}</p>
                  </td>
                  <td className="rr-numeric py-2.5 text-right text-[13px] text-rr-slate">{row.claims}</td>
                  <td className="rr-numeric py-2.5 text-right text-[13px] text-rr-slate">{row.openClaims}</td>
                  <td className="rr-numeric py-2.5 text-right text-[13px] text-rr-ink">{formatUsd(row.claimedUsd)}</td>
                  <td className="rr-numeric py-2.5 text-right text-[13px] text-status-green">{formatUsd(row.recoveredUsd)}</td>
                  <td className="rr-numeric py-2.5 pr-8 text-right text-[13px] font-semibold text-rr-ink">{formatUsd(row.openValueUsd)}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-rr-mist">
                        <div
                          className={cn("h-full rounded-full", statusStyles[row.status].dot)}
                          style={{ width: `${Math.min(100, row.recoveryRatePct)}%` }}
                        />
                      </div>
                      <span className={cn("rr-numeric w-12 text-right text-[12px] font-semibold", statusStyles[row.status].text)}>
                        {row.recoveryRatePct}%
                      </span>
                    </div>
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

function HeroStat({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone: "red" | "amber" | "green" | "cloud";
}) {
  const colour = {
    red: "text-status-red",
    amber: "text-status-amber",
    green: "text-status-green",
    cloud: "text-white",
  }[tone];
  const dot = {
    red: "bg-status-red",
    amber: "bg-status-amber",
    green: "bg-status-green",
    cloud: "bg-rr-cloud",
  }[tone];
  return (
    <div>
      <p className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-1 text-3xl font-semibold", colour)}>{value}</p>
      <p className="text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}
