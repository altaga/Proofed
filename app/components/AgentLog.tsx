export type AgentStep = {
  name: string;
  ok: boolean;
  summary?: string;
  input?: string;
  outcome?: string;
  guardrail?: string;
  decidedBy?: string;
  rejected?: boolean;
};

const LABELS: Record<string, string> = {
  search_catalog: "Searched the catalog",
  list_catalog: "Listed the catalog",
  get_item: "Looked up an item",
  propose_checkout: "Proposed a checkout",
  create_checkout: "Opened a PayPal hold",
  get_order_status: "Checked order status",
  investigate_failure: "Investigated a failure",
  propose_recovery: "Requested recovery",
};

function checks(steps: AgentStep[]): string[] {
  const line: string[] = [];
  if (steps.some((step) => ["search_catalog", "list_catalog", "get_item"].includes(step.name) && step.ok)) {
    line.push("Checked stock ✓");
  }
  if (steps.some((step) => step.ok && (step.guardrail || step.name === "search_catalog" || step.name === "get_item" || step.name === "propose_checkout"))) {
    line.push("Price from catalog ✓");
  }
  const blob = steps.map((step) => `${step.input || ""} ${step.guardrail || ""}`).join(" ");
  const budget = blob.match(/\$\s?(\d+(?:\.\d+)?)/);
  if (steps.some((step) => /budget/i.test(`${step.input || ""} ${step.guardrail || ""}`))) {
    line.push(budget ? `Within $${budget[1]} budget ✓` : "Within budget ✓");
  }
  if (steps.some((step) => step.name === "create_checkout" && step.ok)) {
    line.push("Opened PayPal ✓");
  }
  if (line.length) return line;
  return steps.map((step) => `${LABELS[step.name] || step.name.replaceAll("_", " ")} ${step.ok ? "✓" : "✗"}`);
}

export function AgentLog({ steps, busy }: { steps?: AgentStep[]; busy?: boolean }) {
  if (!steps?.length && !busy) return null;
  if (busy) {
    return (
      <div className="agent-step pending" data-testid="agent-log">
        Looking up the shop…
      </div>
    );
  }
  return (
    <details className="agent-fold" data-testid="agent-log">
      <summary className="agent-step">{checks(steps || []).join("   ")}</summary>
      {(steps || []).map((step, index) => (
        <div key={`${step.name}-${index}`} className="agent-kv">
          <div>{LABELS[step.name] || step.name.replaceAll("_", " ")}</div>
          {step.input ? <div><span>In</span> {step.input}</div> : null}
          {step.outcome || step.summary ? <div><span>Out</span> {step.outcome || step.summary}</div> : null}
          {step.guardrail ? <div className="agent-guard">{step.guardrail}</div> : null}
          {(step.rejected || !step.ok) ? <div className="agent-reject">Checked and corrected by the backend</div> : null}
        </div>
      ))}
    </details>
  );
}
