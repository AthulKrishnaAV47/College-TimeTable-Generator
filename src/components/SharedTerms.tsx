"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/store";
import type { ParsedSlotSheet, ParsedEligibility } from "@/lib/appState";
export type Dataset = { updated_at?: string; id: string; term_label: string; status: string; slot_sheet: ParsedSlotSheet; eligibility: ParsedEligibility };
export default function SharedTerms({ slotSheet, eligibility, termLabel, datasetId, onSelect }: {
  slotSheet: ParsedSlotSheet | null; eligibility: ParsedEligibility | null; termLabel: string; datasetId?: string | null;
  onSelect: (dataset: Dataset) => void;
}) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selection, setSelection] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ datasets: Dataset[] }>("/api/datasets").then(d => setDatasets(d.datasets)).catch(e => setMessage(e.message)); }, []);
  async function run(task: () => Promise<void>) { setBusy(true); setMessage(""); try { await task(); } catch (e) { setMessage(e instanceof Error ? e.message : "Request failed."); } finally { setBusy(false); } }
  return <section className="mb-5 space-y-3 rounded-xl border border-indigo-100 bg-indigo-50 p-5">
    <h2 className="font-bold">Start with a shared term</h2><p className="text-sm">Choose a moderator-approved dataset instead of uploading the same PDFs. Review dates and course details before enrolling.</p>
    <div className="flex flex-wrap gap-2"><select aria-label="Shared term" className="max-w-full rounded-lg border bg-white p-2" value={selection} onChange={e => setSelection(e.target.value)}><option value="">Choose term…</option>{datasets.filter(d => d.status === "published").map(d => <option value={d.id} key={d.id}>{d.term_label}</option>)}</select>
      <button disabled={!selection || busy} className="rounded-lg bg-indigo-600 px-3 py-2 text-white disabled:opacity-50" onClick={() => void run(async () => { const data = await api<{ datasets: Dataset[] }>(`/api/datasets?id=${selection}`); if (!data.datasets[0]) throw new Error("Dataset is no longer available."); onSelect(data.datasets[0]); setMessage("Term loaded. Your existing drafts are kept."); })}>Use this term</button></div>
    {datasetId && <button disabled={busy} className="text-sm underline" onClick={() => { const reason = prompt("What is stale or incorrect? Do not include personal data."); if (reason?.trim()) void run(async () => { const d = await api<{ message: string }>("/api/datasets", { method: "POST", body: JSON.stringify({ action: "flag", id: datasetId, reason }) }); setMessage(d.message); }); }}>Flag this dataset as stale / wrong</button>}
    {slotSheet && eligibility && <div className="text-sm"><button disabled={busy} className="underline" onClick={() => { const label = prompt("Term label (include academic year and department)", termLabel); if (!label || !confirm("Share this parsed data with other students after moderator review? Confirm it contains no personal student information.")) return; void run(async () => { const d = await api<{ message: string }>("/api/datasets", { method: "POST", body: JSON.stringify({ termLabel: label, slotSheet, eligibility }) }); setMessage(d.message); }); }}>Submit current files as a shared dataset</button></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
