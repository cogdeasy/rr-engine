"use client";

import * as React from "react";
import Link from "next/link";
import type { ParameterSignal, ParameterSystem, ParameterTracePoint } from "@rr/types";
import {
  Badge,
  Button,
  CorrelationMatrix,
  DataTable,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  SearchInput,
  SignalTrace,
  StatusPill,
  type Column,
} from "@rr/ui";

const SYSTEM_LABELS: Record<ParameterSystem, string> = {
  fan: "Fan",
  "lp-compressor": "LP compressor",
  "hp-compressor": "HP compressor",
  combustor: "Combustor",
  "hp-turbine": "HP turbine",
  "ip-turbine": "IP turbine",
  "lp-turbine": "LP turbine",
  oil: "Oil system",
  fuel: "Fuel system",
  "air-system": "Air system",
  control: "Control",
  vibration: "Vibration",
  "sensor-health": "Sensor health",
};

const accent: Record<ParameterSignal["strength"], string> = {
  red: "border-status-red",
  amber: "border-status-amber",
  green: "border-status-green",
  grey: "border-rr-ink/20",
};

export interface SignalWorkbenchProps {
  investigationId: string;
  failureMode: string;
  shortlist: ParameterSignal[];
  signals: ParameterSignal[];
  matrix: { codes: string[]; values: number[][] };
  traces: Record<string, ParameterTracePoint[]>;
}

/**
 * The working surface: pick a shortlisted parameter, see how early it leaves
 * the normal band, and check it is not just repeating a parameter already
 * selected.
 */
export function SignalWorkbench({
  investigationId,
  failureMode,
  shortlist,
  signals,
  matrix,
  traces,
}: SignalWorkbenchProps) {
  const [selected, setSelected] = React.useState(shortlist[0]?.parameter.code ?? "");
  const [query, setQuery] = React.useState("");
  const [strongOnly, setStrongOnly] = React.useState(false);
  const [novelOnly, setNovelOnly] = React.useState(false);

  // A new investigation remounts with a different shortlist; follow it.
  React.useEffect(() => {
    setSelected(shortlist[0]?.parameter.code ?? "");
  }, [investigationId, shortlist]);

  const selectedSignal = shortlist.find((signal) => signal.parameter.code === selected) ?? shortlist[0];

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return signals.filter((signal) => {
      if (strongOnly && Math.abs(signal.correlation) < 0.6) return false;
      if (novelOnly && signal.inLiveAnalytic) return false;
      if (!needle) return true;
      return (
        signal.parameter.code.toLowerCase().includes(needle) ||
        signal.parameter.name.toLowerCase().includes(needle) ||
        SYSTEM_LABELS[signal.parameter.system].toLowerCase().includes(needle)
      );
    });
  }, [signals, query, strongOnly, novelOnly]);

  const columns: Column<ParameterSignal>[] = [
    {
      key: "parameter",
      header: "Parameter",
      render: (row) => (
        <div className={`border-l-2 pl-3 ${accent[row.strength]}`}>
          <p className="rr-numeric text-sm font-semibold text-rr-ink">{row.parameter.code}</p>
          <p className="mt-0.5 text-[11px] text-rr-slate">
            {row.parameter.name} · {SYSTEM_LABELS[row.parameter.system]}
          </p>
        </div>
      ),
      sortValue: (row) => row.parameter.code,
    },
    {
      key: "correlation",
      header: "r",
      align: "right",
      render: (row) => (
        <span className="rr-numeric text-sm font-semibold text-rr-ink">{row.correlation.toFixed(2)}</span>
      ),
      sortValue: (row) => Math.abs(row.correlation),
    },
    {
      key: "separation",
      header: "Separation",
      align: "right",
      render: (row) => <span className="rr-numeric text-sm text-rr-ink">{row.separationSigma.toFixed(2)}σ</span>,
      sortValue: (row) => row.separationSigma,
    },
    {
      key: "lead",
      header: "Lead",
      align: "right",
      render: (row) => (
        <span className="rr-numeric text-sm text-rr-ink">{row.leadDays > 0 ? `${row.leadDays}d` : "—"}</span>
      ),
      sortValue: (row) => row.leadDays,
    },
    {
      key: "redundancy",
      header: "Redundancy",
      align: "right",
      render: (row) => (
        <span className={row.redundancy >= 0.7 ? "rr-numeric text-sm text-status-amber" : "rr-numeric text-sm text-rr-ink"}>
          {row.redundancy.toFixed(2)}
        </span>
      ),
      sortValue: (row) => row.redundancy,
    },
    {
      key: "coverage",
      header: "Coverage",
      align: "right",
      render: (row) => <span className="rr-numeric text-sm text-rr-ink">{row.parameter.coveragePct}%</span>,
      sortValue: (row) => row.parameter.coveragePct,
    },
    {
      key: "state",
      header: "State",
      render: (row) =>
        row.inLiveAnalytic ? (
          <Badge variant="neutral">In live analytic</Badge>
        ) : (
          <StatusPill status={row.strength}>{row.strength === "red" ? "Strong · new" : "Candidate"}</StatusPill>
        ),
      sortValue: (row) => (row.inLiveAnalytic ? 1 : 0),
    },
  ];

  return (
    <div className="space-y-4" id="workbench">
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title={selectedSignal ? selectedSignal.parameter.code : "No signal selected"}
            subtitle={
              selectedSignal
                ? `${selectedSignal.parameter.name} — event population median against the normal band, in sigma`
                : undefined
            }
            actions={
              selectedSignal ? (
                <Link href="/assure/change-packs">
                  <Button size="sm" variant="secondary">
                    Raise DN
                  </Button>
                </Link>
              ) : undefined
            }
          />
          {selectedSignal ? (
            <>
              <SignalTrace
                points={traces[selectedSignal.parameter.code] ?? []}
                leadDays={selectedSignal.leadDays}
              />
              <dl className="mt-5 grid grid-cols-4 gap-4 border-t border-rr-ink/10 pt-4">
                <div>
                  <dt className="rr-label text-rr-slate">Correlation</dt>
                  <dd className="rr-numeric mt-1 text-xl font-semibold text-rr-ink">
                    {selectedSignal.correlation.toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="rr-label text-rr-slate">Separation</dt>
                  <dd className="rr-numeric mt-1 text-xl font-semibold text-rr-ink">
                    {selectedSignal.separationSigma.toFixed(2)}σ
                  </dd>
                </div>
                <div>
                  <dt className="rr-label text-rr-slate">Lead time</dt>
                  <dd className="rr-numeric mt-1 text-xl font-semibold text-status-amber">
                    {selectedSignal.leadDays}d
                  </dd>
                </div>
                <div>
                  <dt className="rr-label text-rr-slate">p-value</dt>
                  <dd className="rr-numeric mt-1 text-xl font-semibold text-rr-ink">
                    {selectedSignal.pValue.toFixed(4)}
                  </dd>
                </div>
              </dl>
            </>
          ) : null}
        </Panel>

        <Panel>
          <PanelHeader
            title="Shortlist cross-correlation"
            subtitle="Dark cells are collinear — take one of the pair into the model, not both"
          />
          <CorrelationMatrix codes={matrix.codes} values={matrix.values} selected={selected} onSelect={setSelected} />
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-rr-ink/10 pt-4">
            {shortlist.map((signal) => (
              <button
                key={signal.parameter.code}
                type="button"
                onClick={() => setSelected(signal.parameter.code)}
                className={
                  signal.parameter.code === selected
                    ? "rr-numeric rounded-full bg-rr-blue px-3 py-1 text-[11px] font-semibold text-white"
                    : "rr-numeric rounded-full border border-rr-ink/15 px-3 py-1 text-[11px] text-rr-ink transition-colors hover:border-rr-blue"
                }
              >
                {signal.parameter.code}
              </button>
            ))}
          </div>
        </Panel>
      </section>

      <Panel>
        <PanelHeader
          title="Ranked sweep results"
          subtitle={`Top ${signals.length} of the schema, scored against ${failureMode.toLowerCase()}`}
        />
        <FilterBar className="mb-4">
          <SearchInput value={query} onChange={setQuery} placeholder="Search parameter, system or mnemonic" />
          <FilterChip label="|r| ≥ 0.60" active={strongOnly} onClick={() => setStrongOnly((on) => !on)} />
          <FilterChip label="Not in a live analytic" active={novelOnly} onClick={() => setNovelOnly((on) => !on)} />
        </FilterBar>
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(row) => row.parameter.id}
          onRowClick={(row) => setSelected(row.parameter.code)}
          emptyMessage="No parameters match these filters."
        />
      </Panel>
    </div>
  );
}
