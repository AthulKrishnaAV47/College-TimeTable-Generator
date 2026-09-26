"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/store";
import type { Dataset } from "@/components/SharedTerms";
export default function Admin() {
  const [data, setData] = useState<unknown>(null), [datasets, setDatasets] = useState<Dataset[]>([]);
  const [error, setError] = useState(""), [editor, setEditor] = useState(""), [id, setId] = useState("");
  const [alias, setAlias] = useState(""), [code, setCode] = useState("");
  async function load() { setData(await api("/api/admin")); setDatasets((await api<{ datasets: Dataset[] }>("/api/datasets")).datasets); }
  async function run(task: () => Promise<void>) { setError(""); try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); } }
  useEffect(() => { void run(load); }, []);
  async function change(body: object) { await api("/api/datasets", { method: "PATCH", body: JSON.stringify(body) }); await load(); }
  return <main className="mx-auto max-w-5xl space-y-6 p-6"><a href="/" className="underline">← Scheduler</a><h1 className="text-3xl font-bold">Moderator console</h1>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {data !== null && <><section className="rounded-xl bg-white p-4"><h2 className="font-bold">Aggregate counts, reports & deletion queue</h2><p className="text-sm">Process deletion requests in Supabase Auth within 30 days; deleting the auth user cascades private data. Reports show dataset IDs for review below.</p><pre className="overflow-auto text-xs">{JSON.stringify(data, null, 2)}</pre></section>
      <section className="space-y-3"><h2 className="font-bold">Datasets (latest 100)</h2>{datasets.map(d => <div key={d.id} className="rounded-xl border bg-white p-4"><p>{d.term_label} · {d.status}</p><p className="text-xs">{d.id}</p><div className="flex flex-wrap gap-3 text-sm text-indigo-700">
        <button onClick={() => void run(async () => { const row = (await api<{ datasets: Dataset[] }>(`/api/datasets?id=${d.id}`)).datasets[0]; setId(d.id); setEditor(JSON.stringify({ termLabel: row.term_label, slotSheet: row.slot_sheet, eligibility: row.eligibility }, null, 2)); })}>Review / correct JSON</button>
        <button onClick={() => { if (confirm("Reparse stored extracted text? Corrections will be replaced and the dataset unpublished until reviewed.")) void run(() => change({ id: d.id, action: "reparse" })); }}>Re-run parser</button>
        <button onClick={() => { if (confirm("Publish after reviewing dates, course codes, sections and eligibility?")) void run(() => change({ id: d.id, status: "published" })); }}>Approve</button>
        <button onClick={() => void run(() => change({ id: d.id, status: "archived" }))}>Archive</button>
      </div></div>)}</section>
      {editor && <section><h2 className="font-bold">Edit dataset {id}</h2><textarea aria-label="Dataset JSON" className="h-96 w-full rounded-xl border bg-white p-3 font-mono text-xs" value={editor} onChange={e => setEditor(e.target.value)} /><button onClick={() => void run(async () => { await change({ ...JSON.parse(editor), id, action: "correct" }); setEditor(""); })}>Save corrections (requires reapproval)</button></section>}
      <form className="space-y-3 rounded-xl bg-white p-4" onSubmit={e => { e.preventDefault(); void run(async () => { await api("/api/aliases", { method: "POST", body: JSON.stringify({ alias, course_code: code }) }); setAlias(""); setCode(""); }); }}><h2 className="font-bold">Curated course aliases</h2><label className="block">Alias<input required className="ml-3 border p-2" value={alias} onChange={e => setAlias(e.target.value)} /></label><label className="block">Canonical code<input required className="ml-3 border p-2" value={code} onChange={e => setCode(e.target.value)} /></label><button className="rounded-lg bg-indigo-600 p-2 text-white">Save alias</button><p className="text-xs">Only add verified mappings. Refresh the scheduler to load new aliases; ambiguous initials never resolve automatically.</p></form>
    </>}
  </main>;
}
