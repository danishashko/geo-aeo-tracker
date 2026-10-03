#!/usr/bin/env python3
"""Weekly AEO tracking runner — scrape every due client, write coverage.

For each active + due row in aeo.client:
  build tracker input -> run scripts/run-company.mjs -> analyze -> write_coverage
  (subject_type='client') -> stamp last_run_at.

Deterministic; run by a systemd timer on the box
(deploy/geo-aeo-tracker-weekly.timer). Requires: the tracker service up on
AEO_BASE (default localhost:3939), AEO_WAREHOUSE_DSN in this repo's .env
(reachable — cloud_sql_proxy on the box), and node available.

CLI:
  python3 py/weekly_run.py                       # all due clients
  python3 py/weekly_run.py --client dibara_masonry   # one client, ignore due-check
  python3 py/weekly_run.py --dry-run             # scrape+analyze, print rows, no DB write
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

REPO = Path(__file__).resolve().parents[1]
load_dotenv(REPO / ".env")
sys.path.insert(0, str(REPO / "py"))
import aeo_analyze      # noqa: E402
import aeo_warehouse    # noqa: E402

AEO_BASE = os.environ.get("AEO_BASE_URL", "http://localhost:3939")

REGISTRY_COLS = ("client_id,name,domain,aliases,subject_pattern,vertical,country,"
                 "engines,competitors,prompts")
DUE_SQL = f"""
select {REGISTRY_COLS} from aeo.client
where active and cadence <> 'paused'
  and (last_run_at is null or now()-last_run_at >= (case cadence
        when 'weekly'   then interval '6 days'
        when 'biweekly' then interval '13 days'
        when 'monthly'  then interval '27 days'
        else interval '6 days' end))
order by client_id
"""


def server_up() -> bool:
    try:
        urllib.request.urlopen(urllib.request.Request(AEO_BASE + "/api/scrape", method="GET"), timeout=4)
        return True
    except urllib.error.HTTPError as e:
        return e.code == 405          # route exists, GET not allowed = the tracker
    except Exception:
        return False


def fetch_clients(conn, only: str | None):
    with conn.cursor() as cur:
        if only:
            cur.execute(f"select {REGISTRY_COLS} from aeo.client where client_id=%s", (only,))
        else:
            cur.execute(DUE_SQL)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def build_tracker_doc(c: dict) -> dict:
    comps = c["competitors"] or []
    return {
        "brand": {"name": c["name"], "aliases": c["aliases"] or [c["name"]],
                  "websites": [c["domain"]] if c["domain"] else []},
        "competitors": [{"name": x["name"], "aliases": [x["name"]],
                         "websites": [x["domain"]] if x.get("domain") else []} for x in comps],
        "industry": c["vertical"],          # short tag; prompts carry the context
        "providers": c["engines"],
        "country": c["country"],          # ISO-2, geo-targets each scrape
        "baseUrl": AEO_BASE,
        "prompts": [p["text"] for p in (c["prompts"] or [])],
    }


def scrape(client_id: str, doc: dict) -> list:
    cfg_path = REPO / "scripts" / f"{client_id}.json"
    cfg_path.write_text(json.dumps(doc, indent=2))
    rel = cfg_path.relative_to(REPO)
    print(f"[weekly] {client_id}: run-company.mjs {rel} (metered)")
    proc = subprocess.run(["node", "scripts/run-company.mjs", str(rel)],
                          cwd=REPO, capture_output=True, text=True, timeout=1800)
    sys.stdout.write(proc.stdout[-1500:])
    src = REPO / "public" / "aeo-inject.json"
    if not src.exists():
        raise RuntimeError("run produced no public/aeo-inject.json")
    return json.load(open(src)).get("runs", [])


def run_client(conn, c: dict, *, dry_run: bool = False) -> dict:
    runs = scrape(c["client_id"], build_tracker_doc(c))
    warm = [r for r in runs if len(r.get("answer", "")) > 200
            and "not ready" not in r.get("answer", "").lower()]
    print(f"[weekly] {c['client_id']}: {len(warm)}/{len(runs)} warm answers")
    vendors = {x["name"]: (x.get("pattern") or x["name"]) for x in (c["competitors"] or [])}
    branded = {p["text"] for p in (c["prompts"] or []) if p.get("branded")}
    findings = aeo_analyze.analyze_runs(runs, subject_name=c["name"],
                                        subject_pattern=c["subject_pattern"],
                                        vendors=vendors, branded_prompts=branded)
    res = aeo_warehouse.write_coverage(
        slug=c["client_id"], subject_type="client", subject_name=c["name"],
        subject_domain=c["domain"], subject_aliases=c["aliases"], vertical=c["vertical"],
        findings=findings, run_date=date.today(), dry_run=dry_run)
    if not dry_run:
        with conn.cursor() as cur:
            cur.execute("update aeo.client set last_run_at=now() where client_id=%s", (c["client_id"],))
        conn.commit()
    return res


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--client", help="one client_id, ignore the due-check")
    ap.add_argument("--dry-run", action="store_true", help="scrape+analyze, no DB write")
    a = ap.parse_args()

    if not server_up():
        sys.exit(f"[weekly] tracker not reachable at {AEO_BASE} — start the service first.")

    conn = aeo_warehouse.connect()
    try:
        clients = fetch_clients(conn, a.client)
        if not clients:
            print("[weekly] no due clients"); return
        print(f"[weekly] {len(clients)} client(s): {[c['client_id'] for c in clients]}")
        ok = 0
        for c in clients:
            try:
                run_client(conn, c, dry_run=a.dry_run); ok += 1
            except Exception as e:
                print(f"[weekly] {c['client_id']} FAILED: {e}")
        print(f"[weekly] done: {ok}/{len(clients)} ok")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
