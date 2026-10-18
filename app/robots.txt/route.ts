import { isDemoDeploy, robotsTxt, siteOrigin } from "@/lib/agent-discovery";

// A route handler instead of app/robots.ts: the metadata Robots type has no
// field for the Content-Signal line.
export function GET() {
  return new Response(robotsTxt(isDemoDeploy(), siteOrigin()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
