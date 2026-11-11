"use client";

export function EmptyOrderState({
  title,
  body,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onCreated?: unknown;
}) {
  return (
    <div className="empty-order-state">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
