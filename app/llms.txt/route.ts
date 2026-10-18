import { isDemoDeploy, llmsTxt, siteOrigin } from "@/lib/agent-discovery";

export function GET() {
  if (!isDemoDeploy()) return new Response("Not found", { status: 404 });
  return new Response(llmsTxt(siteOrigin()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
