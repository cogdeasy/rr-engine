import Link from "next/link";
import {
  PARAMETER_SYSTEM_LABELS,
  SHORTLIST_CORRELATION,
  correlationMatrix,
  investigation,
  investigations,
  parameterExplorerSummary,
  parameterSignals,
  parameterTrace,
  shortlist,
} from "@rr/data";
import { Panel, PanelHeader, StatTile, StatusPill, formatNumber } from "@rr/ui";
import { SignalWorkbench } from "@/components/parameter-explorer/signal-workbench";

export const metadata = { title: "Parameter explorer" };

/** How many of the ranked signals are handed to the browser to sort through. */
const TABLE_ROWS = 150;

export default async function ParameterExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ investigation?: string }>;
}) {
  const { investigation: requested } = await searchParams;
  const all = investigations();
  const active = investigation(requested ?? "") ?? all[0]!;
  const summary = parameterExplorerSummary();

  const signals = parameterSignals(active.id);
  const top = signals.slice(0, TABLE_ROWS);
  const picks = shortlist(active.id);
  const matrix = correlationMatrix(active.id);
  // Every row the table can select needs a trace, not just the shortlisted ones.
  const traceable = [...picks, ...top].map((signal) => signal.parameter.code);
  const traces = Object.fromEntries(
    [...new Set(traceable)].map((code) => [code, parameterTrace(active.id, code)]),
  );

  const strong = signals.filter((signal) => Math.abs(signal.correlation) >= SHORTLIST_CORRELATION).length;
  // A sweep can legitimately come back with nothing that clears the thresholds.
  const bestLeadDays = picks.reduce((best, signal) => Math.max(best, signal.leadDays), 0);
  const systemSpread = picks.reduce<Record<string, number>>((acc, signal) => {
    acc[signal.parameter.system] = (acc[signal.parameter.system] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-7">
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Assure · Parameter explorer</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {formatNumber(summary.parametersInScope)} continuous parameters, {picks.length} worth modelling
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Data exploration is the longest phase of every continuous DN. The sweep scores every parameter in the
              schema against a confirmed event population, then strips out the collinear ones — leaving the shortlist a
              data scientist takes into model development, with {bestLeadDays} days of warning at best.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#workbench"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Open the sweep
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/assure/ehm-factory"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                EHM analytics factory
                <span aria-hidden>›</span>
              </Link>
            </div>
          </div>
          <div className="rr-numeric text-right">
            <p className="text-[3.25rem] font-semibold leading-none">{formatNumber(summary.dataPointsM)}m</p>
            <p className="rr-label mt-2 text-rr-blue-200">Data points swept</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Parameters in scope"
          value={formatNumber(active.parametersInScope)}
          caption={`${formatNumber(active.flights)} flights across ${active.eventEngines + active.normalEngines} engines`}
        />
        <StatTile
          label="Above correlation floor"
          value={formatNumber(strong)}
          caption={`|r| ≥ ${SHORTLIST_CORRELATION} before redundancy is stripped out`}
        />
        <StatTile
          label="Event population"
          value={active.eventEngines}
          unit="engines"
          status={active.status}
          caption={
            active.status === "red"
              ? "Thin population — any model built on this needs a wide validation set"
              : "Matched against the normal population by family, thrust rating and route mix"
          }
        />
        <StatTile
          label="Unexploited signals"
          value={summary.unexploited}
          status={summary.unexploited > 0 ? "amber" : "green"}
          caption="Shortlisted across all investigations but not yet carried by a live analytic"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Investigations"
            subtitle="Confirmed in-service events with a matched normal population to sweep against"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {all.map((entry) => {
              const isActive = entry.id === active.id;
              return (
                <Link
                  key={entry.id}
                  href={`/assure/parameter-explorer?investigation=${entry.id}`}
                  className={
                    isActive
                      ? "rounded-sm border border-rr-blue bg-rr-blue-50 px-4 py-3"
                      : "rounded-sm border border-rr-ink/10 px-4 py-3 transition-colors hover:border-rr-blue/40"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-rr-ink">{entry.failureMode}</p>
                    <StatusPill status={entry.status}>{entry.eventEngines} events</StatusPill>
                  </div>
                  <p className="mt-1 text-[11px] text-rr-slate">
                    {entry.id} · {entry.engineFamily} · {formatNumber(entry.flights)} flights · sweep{" "}
                    {entry.sweepMinutes} min
                  </p>
                </Link>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Shortlist by system" subtitle="A single system dominating usually means one root signal" />
          <ul className="space-y-2.5">
            {Object.entries(systemSpread)
              .sort((a, b) => b[1] - a[1])
              .map(([system, count]) => (
                <li key={system}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-rr-ink">
                      {PARAMETER_SYSTEM_LABELS[system as keyof typeof PARAMETER_SYSTEM_LABELS]}
                    </span>
                    <span className="rr-numeric font-semibold text-rr-ink">{count}</span>
                  </div>
                  <div className="mt-1 h-1 w-full bg-rr-mist">
                    <div
                      className="h-1 bg-rr-blue"
                      style={{ width: `${(count / Math.max(picks.length, 1)) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
          </ul>
          <p className="mt-4 text-[11px] leading-relaxed text-rr-slate">
            Sweep cost {active.sweepMinutes} compute minutes over {formatNumber(active.dataPointsM)}m data points.
          </p>
        </Panel>
      </section>

      <SignalWorkbench
        investigationId={active.id}
        failureMode={active.failureMode}
        shortlist={picks}
        signals={top}
        matrix={matrix}
        traces={traces}
      />
    </div>
  );
}
