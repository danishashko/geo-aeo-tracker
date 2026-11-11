import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer, defaultMcpDeps } from "@/lib/server/mcp";
import { checkMcpAuth } from "@/lib/server/mcp-auth";
import { POST as auditRoute } from "@/app/api/audit/route";

export const runtime = "nodejs";
// check_visibility waits on the slowest engine (Bright Data can take ~90s).
export const maxDuration = 300;

/** Runs the existing /api/audit handler in-process, so both share one audit. */
async function auditPage(url: string): Promise<unknown> {
  const res = await auditRoute(
    new NextRequest("http://localhost/api/audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

async function handle(req: Request): Promise<Response> {
  const auth = checkMcpAuth(
    req.headers.get("authorization"),
    process.env.MCP_TOKEN,
  );
  if (!auth.ok) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: auth.message },
        id: null,
      },
      {
        status: auth.status,
        headers:
          auth.status === 401 ? { "WWW-Authenticate": "Bearer" } : undefined,
      },
    );
  }

  // Stateless: a fresh server and transport per request, so it runs the same
  // on one Node process or many serverless instances.
  const server = createMcpServer({ ...defaultMcpDeps, audit: auditPage });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const POST = handle;

// Stateless server: no standalone SSE stream and no sessions to delete. A GET
// stream would otherwise hold a serverless function open until maxDuration.
function methodNotAllowed(): Response {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Send MCP requests as POST.",
      },
      id: null,
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
