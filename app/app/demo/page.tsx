import { getProjectConfig } from "@/lib/config";
import { DemoGuide } from "@/components/DemoGuide";

export default function DemoPage() {
  const cfg = getProjectConfig();
  return (
    <main data-testid="page-presenter">
      <DemoGuide name={cfg.name} venueName={cfg.venueName} />
    </main>
  );
}
