import { isDemoDeploy, llmsFullTxt, siteOrigin } from "@/lib/agent-discovery";

export function GET() {
  if (!isDemoDeploy()) return new Response("Not found", { status: 404 });
  return new Response(llmsFullTxt(siteOrigin()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
