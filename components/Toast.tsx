"use client";

export function Toast({
  message,
  tone = "hold",
}: {
  message: string | null;
  tone?: "hold" | "ok" | "fail";
}) {
  if (!message) return null;
  return (
    <div className={`toast toast-${tone}`} role="status">
      {message}
    </div>
  );
}
