"use client";

import { CheckCircle2, CircleAlert, PackageSearch, Scale, Shield, Search, RefreshCcw, ClipboardList } from "lucide-react";

export type ToolStep = { name: string; ok: boolean; summary?: string };

const ICONS: Record<string, typeof Search> = {
  search_catalog: PackageSearch,
  list_catalog: PackageSearch,
  get_item: Search,
  propose_checkout: Scale,
  create_checkout: Shield,
  get_order_status: ClipboardList,
  investigate_failure: CircleAlert,
  propose_recovery: RefreshCcw,
};

function labelFor(name: string) {
  return name.replaceAll("_", " ");
}

export function ToolSteps({ steps }: { steps: ToolStep[] }) {
  if (!steps.length) return null;
  return (
    <div className="tool-steps" aria-label="Assistant tool steps">
      {steps.map((step, index) => {
        const Icon = ICONS[step.name] ?? (step.ok ? CheckCircle2 : CircleAlert);
        return (
          <div key={`${step.name}-${index}`} className={`tool-step ${step.ok ? "ok" : "bad"}`}>
            <div className="icon-wrap"><Icon size={18} /></div>
            <div>
              <strong>{labelFor(step.name)}</strong>
              <span>{step.summary || (step.ok ? "Completed against live data" : "Failed")}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
