import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: ReactNode;
  selectedIds?: ReadonlySet<string>;
  selectionKey?: (row: T) => string | null | undefined;
  onToggleRow?: (id: string, selected: boolean) => void;
  onRowClick?: (row: T) => void;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel = "No rows.",
  selectedIds,
  selectionKey,
  onToggleRow,
  onRowClick,
}: DataTableProps<T>) {
  const showSelection = Boolean(selectionKey && onToggleRow && selectedIds);

  return (
    <div className="overflow-x-auto border border-[var(--panel-border)] bg-[var(--panel)]">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="border-b border-[var(--panel-border)] bg-slate-50 font-semibold text-slate-600">
          <tr>
            {showSelection ? (
              <th className="w-8 px-3 py-2">
                <span className="sr-only">Select</span>
              </th>
            ) : null}
            {columns.map((col) => (
              <th key={col.key} className={`px-3 py-2 ${col.className ?? ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800">
          {rows.length === 0 ? (
            <tr>
              <td className={`px-3 py-6 text-[var(--muted)] ${showSelection ? "col-span-full" : ""}`} colSpan={columns.length + (showSelection ? 1 : 0)}>
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const keyValue = rowKey(row);
              const selId = selectionKey?.(row);
              const canSelect = selId != null && selId !== "";
              const checked = canSelect ? selectedIds?.has(selId) : false;

              return (
                <tr
                  key={keyValue}
                  className={`hover:bg-slate-50/80 ${onRowClick ? "cursor-pointer focus-within:bg-slate-50" : ""}`}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (!onRowClick || (event.target as HTMLElement).closest('input[type="checkbox"]')) {
                      return;
                    }

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('input[type="checkbox"]')) {
                      return;
                    }

                    onRowClick?.(row);
                  }}
                >
                  {showSelection ? (
                    <td className="align-top px-3 py-2">
                      {canSelect ? (
                        <input
                          type="checkbox"
                          aria-label={`Select row ${selId}`}
                          checked={checked}
                          className="h-4 w-4 accent-[var(--brand)]"
                          onChange={(event) => onToggleRow?.(selId, event.target.checked)}
                        />
                      ) : (
                        <span className="text-[var(--muted)]">–</span>
                      )}
                    </td>
                  ) : null}
                  {columns.map((col) => (
                    <td key={col.key} className={`break-words px-3 py-2 align-top ${col.className ?? ""}`}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
