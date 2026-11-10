import { getProjectConfig } from "@/lib/config";
import { DemoGuide } from "@/components/DemoGuide";

export default function DemoPage() {
  const cfg = getProjectConfig();
  return (
    <main>
      <DemoGuide name={cfg.name} tagline={cfg.tagline} venueName={cfg.venueName} />
    </main>
  );
}
