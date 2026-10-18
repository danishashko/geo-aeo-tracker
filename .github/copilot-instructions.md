# Copilot instructions

Read `AGENTS.md` at the repo root first. It covers setup, environment variables, the API route map, rate limits, conventions and gotchas for this Next.js 16 / React 19 / TypeScript project.

Five rules that matter most:

1. Commands: `npm run dev`, `npm run build`, `npm run lint`, `npm test`, and `npx tsc --noEmit` for a type check. Every environment variable is optional.
2. Tests run with `tsx --test` on `lib/**/*.test.ts` and are free and offline. Existing tests live in `lib/agent-discovery.test.ts` and `lib/proxy.test.ts`. Also run the type check, lint and build before saying a change works.
3. `NEXT_PUBLIC_DEMO_ONLY=true` (or a missing `BRIGHT_DATA_KEY`) shows the sample dataset. The flag is inlined at build time, so changing it needs a rebuild.
4. Most `/api/*` routes call paid APIs (Bright Data, OpenRouter, Gemini) on the deployer's account. Do not run them, or `npm run test:scraper`, without the user's keys and consent.
5. Next 16 uses `proxy.ts` for rate limiting, not `middleware.ts`. Validate every route body with zod and route user URLs through `assertPublicHttpUrl` in `lib/server/ssrf.ts`.
