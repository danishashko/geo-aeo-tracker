import { SovereignDashboard } from "@/components/sovereign-dashboard";
import { isDemoDeploy } from "@/lib/agent-discovery";

// Demo mode has two triggers.
//
// 1. NEXT_PUBLIC_DEMO_ONLY=true — an explicit read-only public preview.
// 2. No BRIGHT_DATA_KEY — nothing can be fetched, so showing the sample
//    dataset beats rendering a live dashboard whose every request 400s.
//
// This is what makes every environment variable optional: a fresh clone or a
// zero-config Vercel deploy lands on a working dashboard, and adding the key
// is what switches it to live data. BRIGHT_DATA_KEY is read here in a server
// component, so it is never shipped to the browser.
const explicitDemo = isDemoDeploy();
const hasBrightDataKey = Boolean((process.env.BRIGHT_DATA_KEY ?? "").trim());

const isDemoOnly = explicitDemo || !hasBrightDataKey;

export default function Home() {
  return (
    <SovereignDashboard
      demoMode={isDemoOnly}
      demoReason={!hasBrightDataKey && !explicitDemo ? "no-key" : "explicit"}
    />
  );
}
