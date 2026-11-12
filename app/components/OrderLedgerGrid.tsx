"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellKeyDownEvent,
  type ColDef,
  type RowClickedEvent,
} from "ag-grid-community";
import { formatWhen, statusWord } from "./tx-model";

ModuleRegistry.registerModules([AllCommunityModule]);

export type LedgerOrder = {
  id: string;
  status: string;
  formatted_total: string;
  paypal_order_id: string | null;
  paypal_authorization_id: string | null;
  paypal_capture_id: string | null;
  created_at: string;
  updated_at: string;
};

// Swiss/fintech dark theme: near-sharp radii, warm borders, single amber accent.
const proofedTheme = themeQuartz.withParams({
  backgroundColor: "#161512",
  foregroundColor: "#F4F1EA",
  headerBackgroundColor: "#1C1B18",
  headerTextColor: "#A6A095",
  borderColor: "#2A2722",
  rowHoverColor: "rgba(217, 119, 6, 0.08)",
  selectedRowBackgroundColor: "rgba(217, 119, 6, 0.16)",
  accentColor: "#D97706",
  borderRadius: 3,
  wrapperBorderRadius: 4,
  fontSize: 13,
  headerFontSize: 11,
  headerFontWeight: 600,
  spacing: 6,
});

const STATUS_COLOR: Record<string, string> = {
  CAPTURED: "#34D399",
  AUTHORIZED: "#FBBF24",
  DELIVERY_CONFIRMED: "#34D399",
  DELIVERY_FAILED: "#FB7185",
  VOIDED: "#FB7185",
  REFUNDED: "#A78BFA",
};

export function OrderLedgerGrid({
  orders,
  selectedId,
  onSelect,
}: {
  orders: LedgerOrder[];
  selectedId: string | null;
  onSelect: (order: LedgerOrder) => void;
}) {
  const columnDefs = useMemo<ColDef<LedgerOrder>[]>(
    () => [
      {
        headerName: "Amount",
        field: "formatted_total",
        width: 120,
        cellClass: "mono",
        comparator: (a: string, b: string) =>
          Number(a.replace(/[^0-9.-]/g, "")) - Number(b.replace(/[^0-9.-]/g, "")),
      },
      {
        headerName: "Status",
        field: "status",
        width: 160,
        valueFormatter: (p) => statusWord(p.value),
        cellStyle: (p) => ({ color: STATUS_COLOR[p.value as string] ?? "#F4F1EA", fontWeight: 600 }),
      },
      {
        headerName: "Updated",
        field: "updated_at",
        width: 170,
        sort: "desc",
        valueGetter: (p) => p.data?.updated_at || p.data?.created_at || "",
        valueFormatter: (p) => (p.value ? formatWhen(p.value) : ""),
      },
      { headerName: "Order ID", field: "id", flex: 1, minWidth: 200, cellClass: "mono" },
      {
        headerName: "PayPal ref",
        flex: 1,
        minWidth: 200,
        cellClass: "mono",
        valueGetter: (p) =>
          p.data?.paypal_capture_id || p.data?.paypal_authorization_id || p.data?.paypal_order_id || "—",
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef<LedgerOrder>>(() => ({ sortable: true, resizable: true, filter: true }), []);

  return (
    <div data-testid="order-ledger" style={{ height: 420, width: "100%" }}>
      <AgGridReact<LedgerOrder>
        theme={proofedTheme}
        rowData={orders}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={(p) => p.data.id}
        rowClassRules={{ "ledger-selected": (p) => p.data?.id === selectedId }}
        onRowClicked={(e: RowClickedEvent<LedgerOrder>) => e.data && onSelect(e.data)}
        onCellKeyDown={(e: CellKeyDownEvent<LedgerOrder>) => {
          const key = (e.event as KeyboardEvent | null)?.key;
          if ((key === "Enter" || key === " ") && e.data) onSelect(e.data);
        }}
        animateRows={false}
        suppressCellFocus={false}
      />
    </div>
  );
}
