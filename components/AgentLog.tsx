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

function tone(step: AgentStep) {
  if (step.rejected || !step.ok) return "rejected";
  const who = (step.decidedBy || "").toLowerCase();
  if (who.includes("paypal")) return "paypal";
  if (who.includes("policy")) return "policy";
  if (who.includes("catalog")) return "catalog";
  return "";
}

export function AgentLog({ steps, busy }: { steps?: AgentStep[]; busy?: boolean }) {
  if (!steps?.length && !busy) return null;
  return (
    <ol className="agent-log" data-testid="agent-log" aria-label="Agent actions">
      {(steps || []).map((step, index) => (
        <li key={`${step.name}-${index}`} className={`agent-step ${tone(step)}`.trim()}>
          <div className="agent-step-head">
            <strong>{LABELS[step.name] || step.name.replaceAll("_", " ")}</strong>
            <span className="who">{step.rejected || !step.ok ? "Backend override" : step.decidedBy || "Backend"}</span>
          </div>
          {step.input && (
            <div className="agent-kv">
              <span>Input</span>
              {step.input}
            </div>
          )}
          {(step.outcome || step.summary) && (
            <div className="agent-kv">
              <span>Result</span>
              {step.outcome || step.summary}
            </div>
          )}
          {step.guardrail && <div className="agent-guard">{step.guardrail}</div>}
          {(step.rejected || !step.ok) && (
            <div className="agent-reject">Backend rejected or overrode the agent</div>
          )}
        </li>
      ))}
      {busy && (
        <li className="agent-step pending">
          <strong>Looking up the catalog and PayPal</strong>
          <div className="skel w-80" />
          <div className="skel w-55" />
        </li>
      )}
    </ol>
  );
}
