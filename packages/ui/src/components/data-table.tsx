"use client";

import * as React from "react";
import { cn } from "../utils";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Cell renderer. */
  render: (row: T) => React.ReactNode;
  /** Optional sort accessor; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  width?: string;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Highlights the row with a left status rail. */
  rowAccent?: (row: T) => string | undefined;
  emptyMessage?: string;
  dense?: boolean;
  initialSortKey?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowAccent,
  emptyMessage = "No records match the current filters.",
  dense = false,
  initialSortKey,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | undefined>(initialSortKey);
  const [descending, setDescending] = React.useState(true);

  const sorted = React.useMemo(() => {
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) return rows;
    const accessor = column.sortValue;
    return [...rows].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av === bv) return 0;
      const result = av > bv ? 1 : -1;
      return descending ? -result : result;
    });
  }, [columns, rows, sortKey, descending]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setDescending((d) => !d);
    } else {
      setSortKey(key);
      setDescending(true);
    }
  }

  return (
    <div className={cn("rr-panel overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    "rr-label px-5 py-3 text-rr-slate/80",
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                    !column.align && "text-left",
                  )}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="inline-flex items-center gap-1 hover:text-rr-blue"
                    >
                      {column.header}
                      <span aria-hidden className={cn("text-[9px]", sortKey === column.key ? "opacity-100" : "opacity-30")}>
                        {sortKey === column.key && !descending ? "▲" : "▼"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-xs text-rr-slate">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const accent = rowAccent?.(row);
                return (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-white/[0.06] transition-colors last:border-0",
                      onRowClick && "cursor-pointer hover:bg-white/[0.045]",
                    )}
                  >
                    {columns.map((column, index) => (
                      <td
                        key={column.key}
                        className={cn(
                          "px-5 text-rr-ink",
                          dense ? "py-2.5" : "py-3.5",
                          column.align === "right" && "text-right",
                          column.align === "center" && "text-center",
                          index === 0 && accent && `border-l-2 ${accent}`,
                          column.className,
                        )}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
