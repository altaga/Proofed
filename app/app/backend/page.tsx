import { BackendMonitor } from "@/components/BackendMonitor";

export const metadata = {
  title: "Proofed",
  description: "Hyper-simple client flow, hold metrics, and settlement pipeline monitor.",
};

export default function BackendPage() {
  return (
    <main data-testid="page-backend">
      <BackendMonitor />
    </main>
  );
}
