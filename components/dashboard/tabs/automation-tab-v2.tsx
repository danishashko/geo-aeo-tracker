import { useState } from "react";
import type { DriftAlert, ScheduleInterval } from "@/components/dashboard/types";
import { PROVIDER_LABELS, SCHEDULE_OPTIONS } from "@/components/dashboard/types";

type AutomationTabProps = {
  scheduleEnabled: boolean;
  scheduleIntervalMs: ScheduleInterval;
  lastScheduledRun: string | null;
  driftAlerts: DriftAlert[];
  busy: boolean;
  onToggleSchedule: (enabled: boolean) => void;
  onIntervalChange: (interval: ScheduleInterval) => void;
  onRunNow: () => void;
  onDismissAlert: (id: string) => void;
  onDismissAllAlerts: () => void;
};

export function AutomationTab({
  scheduleEnabled,
  scheduleIntervalMs,
  lastScheduledRun,
  driftAlerts,
  busy,
  onToggleSchedule,
  onIntervalChange,
  onRunNow,
  onDismissAlert,
  onDismissAllAlerts,
}: AutomationTabProps) {
  const [showDismissed, setShowDismissed] = useState(false);

  const activeAlerts = driftAlerts.filter((a) => !a.dismissed);
  const dismissedAlerts = driftAlerts.filter((a) => a.dismissed);
  const displayAlerts = showDismissed ? driftAlerts : activeAlerts;

  return (
    <div className="space-y-5">
      {/* ── Schedule Control ── */}
      <div className="rounded-xl border border-th-border bg-th-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-th-text flex items-center gap-2">
              <span>⏱</span> Auto-Run Scheduler
            </h3>
            <p className="mt-0.5 text-xs text-th-text-muted">
              Automatically re-run all tracked prompts on a schedule. Drift alerts trigger when visibility changes.
            </p>
          </div>
          <button
            onClick={() => onToggleSchedule(!scheduleEnabled)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              scheduleEnabled ? "bg-th-accent" : "bg-th-card-alt border border-th-border"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                scheduleEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Interval picker */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SCHEDULE_OPTIONS.map((opt) => {
            const active = scheduleIntervalMs === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onIntervalChange(opt.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? "border-th-accent bg-th-accent-soft shadow-[inset_0_0_0_1px_var(--th-accent)]"
                    : "border-th-border bg-th-card hover:border-th-border-hover hover:bg-th-card-hover"
                }`}
              >
                <div className={`text-sm font-semibold ${active ? "text-th-text-accent" : "text-th-text"}`}>
                  {opt.label}
                </div>
                <div className="mt-0.5 text-xs text-th-text-muted">{opt.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Status bar */}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-th-border bg-th-card-alt px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${scheduleEnabled ? "bg-th-success animate-pulse" : "bg-th-text-muted"}`} />
            <span className="text-sm text-th-text">
              {scheduleEnabled ? "Scheduler active" : "Scheduler paused"}
            </span>
          </div>
          <span className="text-xs text-th-text-muted">·</span>
          <span className="text-xs text-th-text-muted">
            Interval: <span className="font-medium text-th-text">{SCHEDULE_OPTIONS.find((o) => o.value === scheduleIntervalMs)?.label}</span>
          </span>
          {lastScheduledRun && (
            <>
              <span className="text-xs text-th-text-muted">·</span>
              <span className="text-xs text-th-text-muted">
                Last run: <span className="font-medium text-th-text">{lastScheduledRun.replace("T", " ").slice(0, 16)}</span>
              </span>
            </>
          )}
          <button
            onClick={onRunNow}
            disabled={busy}
            className="ml-auto rounded-lg bg-th-accent px-3 py-1.5 text-xs font-medium text-th-text-inverse hover:brightness-110 transition disabled:opacity-50"
          >
            {busy ? "Running…" : "Run Now"}
          </button>
        </div>
      </div>

      {/* ── How it works ── */}
      <div className="rounded-xl border border-th-border bg-th-card-alt p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-th-text-muted">How It Works</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-th-accent-soft text-sm font-bold text-th-text-accent">1</span>
            <div>
              <div className="text-sm font-medium text-th-text">Schedule Runs</div>
              <div className="text-xs text-th-text-muted">All tracked prompts are re-run across your selected models at the chosen interval.</div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-th-accent-soft text-sm font-bold text-th-text-accent">2</span>
            <div>
              <div className="text-sm font-medium text-th-text">Compare Results</div>
              <div className="text-xs text-th-text-muted">Each new run is compared against the previous run for the same prompt + model.</div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-th-accent-soft text-sm font-bold text-th-text-accent">3</span>
            <div>
              <div className="text-sm font-medium text-th-text">Drift Alerts</div>
              <div className="text-xs text-th-text-muted">If visibility drops ≥10 points, a drift alert is triggered so you can investigate.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Drift Alerts ── */}
      <div className="rounded-xl border border-th-border bg-th-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🔔</span>
            <h3 className="text-sm font-semibold text-th-text">
              Drift Alerts
              {activeAlerts.length > 0 && (
                <span className="ml-2 rounded-full bg-th-danger px-2 py-0.5 text-xs font-bold text-white">
                  {activeAlerts.length}
                </span>
              )}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {dismissedAlerts.length > 0 && (
              <button
                onClick={() => setShowDismissed(!showDismissed)}
                className="text-xs text-th-text-muted hover:text-th-text-secondary"
              >
                {showDismissed ? "Hide dismissed" : `Show dismissed (${dismissedAlerts.length})`}
              </button>
            )}
            {activeAlerts.length > 0 && (
              <button
                onClick={onDismissAllAlerts}
                className="rounded-lg border border-th-border px-2.5 py-1 text-xs text-th-text-muted hover:bg-th-card-hover"
              >
                Dismiss all
              </button>
            )}
          </div>
        </div>

        {displayAlerts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-th-border bg-th-card-alt p-6 text-center">
            <p className="text-sm text-th-text-muted">
              {driftAlerts.length === 0
                ? "No drift alerts yet. Enable the scheduler and run prompts to start monitoring."
                : "All alerts dismissed."}
            </p>
          </div>
        ) : (
          <div className="max-h-[400px] space-y-2 overflow-auto pr-1">
            {displayAlerts.map((alert) => {
              const up = alert.delta > 0;
              return (
                <div
                  key={alert.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                    alert.dismissed
                      ? "border-th-border bg-th-card-alt opacity-60"
                      : up
                        ? "border-th-success/30 bg-th-success-soft"
                        : "border-th-danger/30 bg-th-danger-soft"
                  }`}
                >
                  <span className={`text-xl font-bold ${up ? "text-th-success" : "text-th-danger"}`}>
                    {up ? "↑" : "↓"}{Math.abs(alert.delta)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-th-text">
                      {alert.prompt.length > 80 ? alert.prompt.slice(0, 77) + "…" : alert.prompt}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-th-text-muted">
                      <span>{PROVIDER_LABELS[alert.provider]}</span>
                      <span>·</span>
                      <span>{alert.oldScore} → {alert.newScore}</span>
                      <span>·</span>
                      <span>{alert.createdAt.replace("T", " ").slice(0, 16)}</span>
                    </div>
                  </div>
                  {!alert.dismissed && (
                    <button
                      onClick={() => onDismissAlert(alert.id)}
                      className="shrink-0 rounded-md border border-th-border px-2 py-1 text-xs text-th-text-muted hover:bg-th-card-hover"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Export Options (legacy compat) ── */}
      <details className="rounded-xl border border-th-border">
        <summary className="cursor-pointer px-4 py-3 text-sm text-th-text-muted hover:bg-th-card-hover">
          Advanced: External Automation (Vercel Cron / GitHub Actions)
        </summary>
        <div className="border-t border-th-border px-4 py-3 text-sm text-th-text-secondary space-y-2">
          <p>
            <span className="font-semibold text-th-text">Option A: Vercel Cron</span> — Add a cron expression to your{" "}
            <code className="rounded bg-th-card px-1.5 py-0.5 text-xs text-th-text-accent">vercel.json</code>
          </p>
          <p>
            <span className="font-semibold text-th-text">Option B: GitHub Actions</span> — Create a workflow that hits your API route on a schedule
          </p>
          <p className="text-xs text-th-text-muted">
            The in-app scheduler above handles everything without external services, as long as the browser tab stays open.
          </p>
        </div>
      </details>
    </div>
  );
}
