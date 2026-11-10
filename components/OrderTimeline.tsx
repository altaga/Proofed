"use client";

const STEPS = [
  { key: "CREATED", label: "Created" },
  { key: "APPROVED", label: "Approved" },
  { key: "AUTHORIZED", label: "Authorized hold" },
  { key: "DELIVERY_CONFIRMED", label: "Handover proven" },
  { key: "CAPTURED", label: "Captured" },
] as const;

const FAIL_AFTER = new Set(["DELIVERY_FAILED", "VOIDED", "REFUNDED", "FAILED", "EXPIRED", "CANCELLED"]);

export function OrderTimeline({ status }: { status: string }) {
  if (FAIL_AFTER.has(status) && status !== "REFUNDED") {
    const failLabel =
      status === "DELIVERY_FAILED" ? "Handover failed" :
      status === "VOIDED" ? "Authorization voided" :
      status === "CANCELLED" ? "Cancelled" :
      status === "EXPIRED" ? "Expired" : "Failed";
    return (
      <ol className="timeline">
        {STEPS.slice(0, 3).map((step) => (
          <li key={step.key} className="timeline-step done">
            <span className="dot" />
            <div>{step.label}</div>
          </li>
        ))}
        <li className="timeline-step current bad">
          <span className="dot" />
          <div>{failLabel}<div><small>Funds were not captured unless a refund path is shown.</small></div></div>
        </li>
      </ol>
    );
  }

  const order = ["CREATED", "APPROVED", "AUTHORIZED", "DELIVERY_CONFIRMED", "CAPTURED"];
  const currentIndex = Math.max(0, order.indexOf(status === "REFUNDED" ? "CAPTURED" : status));
  return (
    <ol className="timeline">
      {STEPS.map((step, index) => {
        const done = index < currentIndex || status === "CAPTURED" || status === "REFUNDED";
        const current = step.key === status;
        return (
          <li key={step.key} className={`timeline-step${done ? " done" : ""}${current ? " current" : ""}`}>
            <span className="dot" />
            <div>
              {step.label}
              {status === "REFUNDED" && step.key === "CAPTURED" ? <div><small>Later refunded</small></div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
