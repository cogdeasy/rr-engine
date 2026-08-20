"use client";

import * as React from "react";
import type {
  CriticalPartRegisterEntry,
  PurchaseOrder,
  ShortageRisk,
  StatusLevel,
  SupplierPerformance,
} from "@rr/types";
import {
  Badge,
  DataTable,
  FilterBar,
  FilterChip,
  SearchInput,
  Sparkline,
  StatusDot,
  StatusPill,
  Tabs,
  cn,
  formatDate,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";

type TabId = "risk" | "orders" | "suppliers" | "register";

const STATUS_FILTERS: { id: StatusLevel; label: string }[] = [
  { id: "red", label: "Act now" },
  { id: "amber", label: "Watchlist" },
  { id: "green", label: "Nominal" },
];

const PO_STATE_LABEL: Record<PurchaseOrder["state"], string> = {
  requisitioned: "Requisitioned",
  placed: "Placed",
  acknowledged: "Acknowledged",
  "in-manufacture": "In manufacture",
  "in-transit": "In transit",
  "customs-hold": "Customs hold",
  received: "Received",
};

const accentFor = (status: StatusLevel) =>
  status === "red" ? "border-status-red" : status === "amber" ? "border-status-amber" : "border-transparent";

/**
 * The working surface behind the decision: shortage lines, the order book, the
 * suppliers behind them and the register of parts with no second source.
 */
export function SupplyWorkbench({
  shortages,
  orders,
  suppliers,
  register,
}: {
  shortages: ShortageRisk[];
  orders: PurchaseOrder[];
  suppliers: SupplierPerformance[];
  register: CriticalPartRegisterEntry[];
}) {
  const [tab, setTab] = React.useState<TabId>("risk");
  const [query, setQuery] = React.useState("");
  const [statuses, setStatuses] = React.useState<StatusLevel[]>([]);
  const [singleSourceOnly, setSingleSourceOnly] = React.useState(false);

  const matches = React.useCallback(
    (haystack: string[], status: StatusLevel) => {
      const q = query.trim().toLowerCase();
      const textOk = q.length === 0 || haystack.some((value) => value.toLowerCase().includes(q));
      const statusOk = statuses.length === 0 || statuses.includes(status);
      return textOk && statusOk;
    },
    [query, statuses],
  );

  const visibleShortages = shortages.filter(
    (row) =>
      matches([row.partNumber, row.description, row.supplier, row.workOrderReference, row.engineEsn, row.facilityName], row.status) &&
      (!singleSourceOnly || row.singleSource),
  );
  const visibleOrders = orders.filter((row) =>
    matches([row.reference, row.partNumber, row.description, row.supplier], row.status),
  );
  const visibleSuppliers = suppliers.filter((row) => matches([row.supplier], row.status));
  const visibleRegister = register.filter(
    (row) => matches([row.partNumber, row.description, row.supplier], row.status) && (!singleSourceOnly || row.singleSource),
  );

  function toggleStatus(status: StatusLevel) {
    setStatuses((current) => (current.includes(status) ? current.filter((s) => s !== status) : [...current, status]));
  }

  return (
    <div className="space-y-4">
      <Tabs
        active={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={[
          { id: "risk", label: "Lead-time risk", count: shortages.length },
          { id: "orders", label: "Purchase orders", count: orders.length },
          { id: "suppliers", label: "Supplier performance", count: suppliers.length },
          { id: "register", label: "Single-source & long-lead", count: register.length },
        ]}
      />

      <FilterBar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((filter) => (
            <FilterChip
              key={filter.id}
              label={filter.label}
              active={statuses.includes(filter.id)}
              onClick={() => toggleStatus(filter.id)}
            />
          ))}
          {tab === "risk" || tab === "register" ? (
            <FilterChip label="Single source only" active={singleSourceOnly} onClick={() => setSingleSourceOnly((v) => !v)} />
          ) : null}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Part, supplier, work order" className="w-64" />
      </FilterBar>

      {tab === "risk" ? (
        <DataTable
          rows={visibleShortages}
          rowKey={(row) => row.id}
          initialSortKey="gap"
          dense
          rowAccent={(row) => accentFor(row.status)}
          emptyMessage="No material risk matches these filters."
          columns={[
            {
              key: "part",
              header: "Part",
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate font-medium text-rr-ink">{row.description}</p>
                  <p className="rr-numeric text-[11px] text-rr-slate">
                    {row.partNumber} · {row.moduleCode}
                    {row.singleSource ? <span className="ml-1.5 text-status-amber">single source</span> : null}
                  </p>
                </div>
              ),
              sortValue: (row) => row.description,
            },
            {
              key: "demand",
              header: "Demand",
              render: (row) => (
                <div>
                  <p className="rr-numeric font-medium text-rr-ink">{row.workOrderReference}</p>
                  <p className="text-[11px] text-rr-slate">
                    {row.engineEsn} · {row.operatorCode} · {row.workOrderType}
                  </p>
                </div>
              ),
              sortValue: (row) => row.workOrderReference,
            },
            { key: "facility", header: "Facility", render: (row) => <span className="text-xs text-rr-slate">{row.facilityName}</span>, sortValue: (row) => row.facilityName },
            {
              key: "required",
              header: "Required on dock",
              align: "right",
              render: (row) => (
                <div>
                  <p className="rr-numeric text-rr-ink">{formatDate(row.requiredOnDock)}</p>
                  <p className="rr-numeric text-[11px] text-rr-slate">
                    {row.daysToRequired >= 0 ? `in ${row.daysToRequired}d` : `${Math.abs(row.daysToRequired)}d overdue`}
                  </p>
                </div>
              ),
              sortValue: (row) => row.daysToRequired,
            },
            {
              key: "cover",
              header: "Earliest cover",
              align: "right",
              render: (row) => (
                <div>
                  <p className="rr-numeric text-rr-ink">{formatDate(row.earliestCoverAt)}</p>
                  <p className="rr-numeric text-[11px] text-rr-slate">
                    {row.qtyAvailable}/{row.qtyRequired} on shelf · {row.leadTimeDays}d lead
                  </p>
                </div>
              ),
              sortValue: (row) => row.earliestCoverAt,
            },
            {
              key: "gap",
              header: "Delay",
              align: "right",
              render: (row) => (
                <span className={cn("rr-numeric text-base font-semibold", statusStyles[row.status].text)}>
                  {row.gapDays > 0 ? `+${row.gapDays}d` : `${row.gapDays}d`}
                </span>
              ),
              sortValue: (row) => row.gapDays,
            },
            {
              key: "exposure",
              header: "Delay cost",
              align: "right",
              render: (row) => <span className="rr-numeric text-rr-ink">{row.delayCostUsd > 0 ? formatUsd(row.delayCostUsd) : "—"}</span>,
              sortValue: (row) => row.delayCostUsd,
            },
            {
              key: "action",
              header: "Recommended action",
              render: (row) => (
                <div className="flex items-start gap-2">
                  <StatusDot status={row.status} className="mt-1.5" />
                  <span className="text-xs leading-snug text-rr-slate">{row.recommendedAction}</span>
                </div>
              ),
            },
          ]}
        />
      ) : null}

      {tab === "orders" ? (
        <DataTable
          rows={visibleOrders}
          rowKey={(row) => row.id}
          initialSortKey="late"
          dense
          rowAccent={(row) => accentFor(row.status)}
          emptyMessage="No purchase orders match these filters."
          columns={[
            {
              key: "reference",
              header: "Order",
              render: (row) => (
                <div>
                  <p className="rr-numeric font-medium text-rr-ink">{row.reference}</p>
                  <p className="text-[11px] text-rr-slate">{row.supplier}</p>
                </div>
              ),
              sortValue: (row) => row.reference,
            },
            {
              key: "part",
              header: "Part",
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-rr-ink">{row.description}</p>
                  <p className="rr-numeric text-[11px] text-rr-slate">{row.partNumber}</p>
                </div>
              ),
              sortValue: (row) => row.description,
            },
            { key: "qty", header: "Qty", align: "right", render: (row) => <span className="rr-numeric">{row.qty}</span>, sortValue: (row) => row.qty },
            {
              key: "value",
              header: "Value",
              align: "right",
              render: (row) => <span className="rr-numeric">{formatUsd(row.valueUsd)}</span>,
              sortValue: (row) => row.valueUsd,
            },
            {
              key: "state",
              header: "State",
              render: (row) => <Badge variant={row.state === "customs-hold" ? "brand" : "neutral"}>{PO_STATE_LABEL[row.state]}</Badge>,
              sortValue: (row) => row.state,
            },
            {
              key: "promised",
              header: "Promised",
              align: "right",
              render: (row) => <span className="rr-numeric text-rr-slate">{formatDate(row.promisedAt)}</span>,
              sortValue: (row) => row.promisedAt,
            },
            {
              key: "expected",
              header: "Expected",
              align: "right",
              render: (row) => (
                <div>
                  <p className="rr-numeric text-rr-ink">{formatDate(row.expectedAt)}</p>
                  {row.slipDays !== 0 ? (
                    <p className={cn("rr-numeric text-[11px]", row.slipDays > 0 ? "text-status-amber" : "text-status-green")}>
                      {row.slipDays > 0 ? `${row.slipDays}d slip` : `${Math.abs(row.slipDays)}d early`}
                    </p>
                  ) : (
                    <p className="text-[11px] text-rr-slate">on promise</p>
                  )}
                </div>
              ),
              sortValue: (row) => row.expectedAt,
            },
            {
              key: "late",
              header: "Vs need",
              align: "right",
              render: (row) =>
                row.lateByDays === null ? (
                  <span className="text-[11px] text-rr-slate">no linked demand</span>
                ) : (
                  <span className={cn("rr-numeric font-semibold", row.lateByDays > 0 ? "text-status-red" : "text-status-green")}>
                    {row.lateByDays > 0 ? `+${row.lateByDays}d late` : `${Math.abs(row.lateByDays)}d clear`}
                  </span>
                ),
              sortValue: (row) => row.lateByDays ?? -999,
            },
          ]}
        />
      ) : null}

      {tab === "suppliers" ? (
        <DataTable
          rows={visibleSuppliers}
          rowKey={(row) => row.supplier}
          initialSortKey="shortages"
          rowAccent={(row) => accentFor(row.status)}
          emptyMessage="No suppliers match these filters."
          columns={[
            {
              key: "supplier",
              header: "Supplier",
              render: (row) => (
                <div className="flex items-center gap-2">
                  <StatusDot status={row.status} />
                  <span className="font-medium text-rr-ink">{row.supplier}</span>
                </div>
              ),
              sortValue: (row) => row.supplier,
            },
            {
              key: "otd",
              header: "On-time delivery",
              align: "right",
              render: (row) => (
                <div className="flex items-center justify-end gap-3">
                  <Sparkline points={row.history} status={row.status} height={22} className="w-24" />
                  <span className={cn("rr-numeric w-14 text-base font-semibold", statusStyles[row.status].text)}>
                    {row.onTimeDeliveryPct}%
                  </span>
                </div>
              ),
              sortValue: (row) => row.onTimeDeliveryPct,
            },
            {
              key: "quality",
              header: "Quality escapes",
              align: "right",
              render: (row) => (
                <span className="rr-numeric">
                  {row.qualityEscapesPer1000}
                  <span className="ml-1 text-[11px] text-rr-slate">/1k</span>
                </span>
              ),
              sortValue: (row) => row.qualityEscapesPer1000,
            },
            {
              key: "variance",
              header: "Lead-time variance",
              align: "right",
              render: (row) => (
                <span className="rr-numeric">
                  ±{row.leadTimeVarianceDays}
                  <span className="ml-1 text-[11px] text-rr-slate">d on {row.averageLeadTimeDays}d</span>
                </span>
              ),
              sortValue: (row) => row.leadTimeVarianceDays,
            },
            {
              key: "book",
              header: "Open book",
              align: "right",
              render: (row) => (
                <div>
                  <p className="rr-numeric text-rr-ink">{formatUsd(row.openPoValueUsd)}</p>
                  <p className="rr-numeric text-[11px] text-rr-slate">{row.openPoCount} orders</p>
                </div>
              ),
              sortValue: (row) => row.openPoValueUsd,
            },
            {
              key: "shortages",
              header: "Driving shortages",
              align: "right",
              render: (row) => (
                <span className={cn("rr-numeric text-base font-semibold", row.criticalShortageCount > 0 ? "text-status-red" : "text-rr-ink")}>
                  {row.criticalShortageCount}
                </span>
              ),
              sortValue: (row) => row.criticalShortageCount,
            },
            {
              key: "single",
              header: "Sole-sourced parts",
              align: "right",
              render: (row) => <span className="rr-numeric text-rr-slate">{row.singleSourcePartCount}</span>,
              sortValue: (row) => row.singleSourcePartCount,
            },
          ]}
        />
      ) : null}

      {tab === "register" ? (
        <DataTable
          rows={visibleRegister}
          rowKey={(row) => row.partNumber}
          initialSortKey="lead"
          dense
          rowAccent={(row) => accentFor(row.status)}
          emptyMessage="No register entries match these filters."
          columns={[
            {
              key: "part",
              header: "Part",
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate font-medium text-rr-ink">{row.description}</p>
                  <p className="rr-numeric text-[11px] text-rr-slate">
                    {row.partNumber} · {row.moduleCode}
                  </p>
                </div>
              ),
              sortValue: (row) => row.description,
            },
            { key: "supplier", header: "Supplier", render: (row) => <span className="text-xs text-rr-slate">{row.supplier}</span>, sortValue: (row) => row.supplier },
            {
              key: "flags",
              header: "Exposure",
              render: (row) => (
                <div className="flex flex-wrap gap-1">
                  {row.singleSource ? <Badge variant="outline">Single source</Badge> : null}
                  {row.longLead ? <Badge variant="brand">Long lead</Badge> : null}
                </div>
              ),
            },
            {
              key: "lead",
              header: "Lead time",
              align: "right",
              render: (row) => (
                <span className="rr-numeric">
                  {row.leadTimeDays}
                  <span className="ml-1 text-[11px] text-rr-slate">d</span>
                </span>
              ),
              sortValue: (row) => row.leadTimeDays,
            },
            {
              key: "stock",
              header: "On hand / on order",
              align: "right",
              render: (row) => (
                <span className="rr-numeric">
                  {row.onHand} / {row.onOrder}
                </span>
              ),
              sortValue: (row) => row.onHand,
            },
            {
              key: "demand",
              header: "90-day demand",
              align: "right",
              render: (row) => <span className="rr-numeric">{formatNumber(row.demand90d)}</span>,
              sortValue: (row) => row.demand90d,
            },
            {
              key: "cover",
              header: "Cover",
              align: "right",
              render: (row) =>
                row.coverDays === null ? (
                  <StatusPill status="grey">No demand</StatusPill>
                ) : (
                  <span className={cn("rr-numeric font-semibold", statusStyles[row.status].text)}>{row.coverDays}d</span>
                ),
              sortValue: (row) => row.coverDays ?? -1,
            },
            {
              key: "value",
              header: "Unit cost",
              align: "right",
              render: (row) => <span className="rr-numeric text-rr-slate">{formatUsd(row.unitCostUsd)}</span>,
              sortValue: (row) => row.unitCostUsd,
            },
          ]}
        />
      ) : null}
    </div>
  );
}
