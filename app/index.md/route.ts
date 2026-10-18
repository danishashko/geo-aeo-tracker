import { isDemoDeploy, llmsFullTxt, siteOrigin } from "@/lib/agent-discovery";

// Markdown twin of `/` and `/demo`. proxy.ts rewrites `Accept: text/markdown`
// requests here.
export function GET() {
  if (!isDemoDeploy()) return new Response("Not found", { status: 404 });
  return new Response(llmsFullTxt(siteOrigin()), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
    },
  });
}
