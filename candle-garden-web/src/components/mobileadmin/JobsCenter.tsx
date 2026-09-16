"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Play, RefreshCw, XCircle } from "lucide-react";

type Job = { id: string; name: string; schedule: string; source: string; agent: string; description?: string };
type Run = { id: string; jobId: string; trigger: "schedule" | "manual" | "webhook"; status: "running" | "succeeded" | "failed"; startedAt: string; completedAt?: string; discovered?: number; added?: number; updated?: number; removed?: number; message?: string };

function when(value?: string) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function duration(run?: Run) {
  if (!run?.completedAt) return "—";
  const milliseconds = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
  return milliseconds < 1000 ? `${milliseconds} ms` : `${(milliseconds / 1000).toFixed(1)} s`;
}

function JobPerformance({ runs }: { runs: Run[] }) {
  const finished = runs.filter((run) => run.completedAt);
  const successful = finished.filter((run) => run.status === "succeeded");
  const average = successful.length ? successful.reduce((sum, run) => sum + new Date(run.completedAt!).getTime() - new Date(run.startedAt).getTime(), 0) / successful.length : 0;
  const successRate = finished.length ? Math.round((successful.length / finished.length) * 100) : 0;
  return <div className="job-performance">
    <div><span>Last runtime</span><strong>{duration(finished[0])}</strong></div>
    <div><span>Average runtime</span><strong>{average ? `${(average / 1000).toFixed(1)} s` : "—"}</strong></div>
    <div><span>Success rate</span><strong>{finished.length ? `${successRate}%` : "—"}</strong></div>
    <div><span>Last success</span><strong>{successful[0] ? when(successful[0].completedAt) : "—"}</strong></div>
    <div><span>Latest items</span><strong>{successful[0]?.discovered ?? "—"}</strong></div>
  </div>;
}

export function JobsCenter() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/mobileadmin/jobs", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load scheduled jobs.");
      const data = (await response.json()) as { jobs?: Job[]; runs?: Run[] };
      setJobs(data.jobs || []); setRuns(data.runs || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load scheduled jobs."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function runNow(jobId: string) {
    setRunning(jobId); setError("");
    try {
      const response = await fetch("/api/mobileadmin/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId }) });
      const data = (await response.json()) as { run?: Run; error?: string };
      if (!response.ok) throw new Error(data.run?.message || data.error || "The refresh failed.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The refresh failed."); }
    finally { await load(); setRunning(null); }
  }

  return <section className="jobs-center">
    <div className="jobs-section-head"><div><p>Scheduled agents</p><h2>Automation</h2></div><button onClick={() => void load()} disabled={loading || Boolean(running)}><RefreshCw size={15} /> Refresh</button></div>
    {error ? <div className="jobs-error">{error}</div> : null}
    {jobs.map((job) => { const jobRuns = runs.filter((run) => run.jobId === job.id); const latest = jobRuns[0]; const isRunning = running === job.id; return <article className="job-card" key={job.id}><div className="job-card-main"><span className="job-icon"><RefreshCw size={20} /></span><div><div className="job-title-row"><h3>{job.name}</h3><em>Active</em></div><p>{job.description || `${job.agent} checks Squarespace and safely publishes product names, availability, images, and prices to the mobile app.`}</p><div className="job-meta"><span><Clock3 size={14} /> {job.schedule}</span><a href={job.source} target="_blank" rel="noreferrer">View source</a></div></div></div><div className="job-card-action"><span>Latest: {latest ? latest.status : "Not run yet"}</span><button onClick={() => void runNow(job.id)} disabled={Boolean(running)}>{isRunning ? <RefreshCw className="is-spinning" size={16} /> : <Play size={16} />}{isRunning ? "Refreshing…" : "Run now"}</button></div><JobPerformance runs={jobRuns} /></article>; })}
    <div className="jobs-section-head jobs-history-head"><div><p>Execution log</p><h2>Recent runs</h2></div></div>
    {loading ? <div className="mobileadmin-empty">Loading job history…</div> : runs.length === 0 ? <div className="mobileadmin-empty">No executions yet. Use Run now to perform the first refresh.</div> : <div className="mobileadmin-table-wrap"><table><thead><tr><th>Status</th><th>Started</th><th>Trigger</th><th>Items</th><th>Changes</th><th>Result</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><span className={`job-status is-${run.status}`}>{run.status === "succeeded" ? <CheckCircle2 size={14} /> : run.status === "failed" ? <XCircle size={14} /> : <RefreshCw size={14} />}{run.status}</span></td><td>{when(run.startedAt)}</td><td>{run.trigger === "manual" ? "Run now" : run.trigger === "webhook" ? "Webhook" : "Schedule"}</td><td>{run.discovered ?? "—"}</td><td>{run.status === "succeeded" ? `+${run.added || 0} · ${run.updated || 0} updated · −${run.removed || 0}` : "—"}</td><td>{run.message || "—"}</td></tr>)}</tbody></table></div>}
  </section>;
}
