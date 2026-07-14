import React from "react";
import { AlertCircle, Bot, CheckCircle2 } from "lucide-react";
import { createAiJobLedger } from "../libraryModel.ts";
import { OrbIcon, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.tsx";

export function AiJobsScreen({ decks, jobs }: any) {
  const ledger = createAiJobLedger({ decks, jobs });

  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Orchestrierung" title="KI-Jobs" />
      <div className="grid gap-6 lg:grid-cols-3">
        <StatTile icon={Bot} label="Jobs" value={ledger.total} />
        <StatTile icon={CheckCircle2} label="Succeeded" value={ledger.succeeded} accent="text-emerald-700" />
        <StatTile icon={AlertCircle} label="Failed" value={ledger.failed} accent="text-red-700" />
      </div>
      <SoftPanel className="p-6">
        <div className="grid gap-3">
          {ledger.jobs.length === 0 ? (
            <p className="text-sm text-[#66709a]">Keine Jobs.</p>
          ) : (
            ledger.jobs.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] px-4 py-3">
                <OrbIcon icon={Bot} className="size-10 bg-indigo-50 text-indigo-700" />
                <div className="min-w-[14rem] flex-1">
                  <p className="text-sm font-semibold text-[#17214f]">{String((job as any).jobType ?? "")}</p>
                  <p className="text-xs text-[#66709a]">{job.deckName ?? job.deckId ?? "global"} · {job.createdAt}</p>
                </div>
                <span className={`rounded-xl px-3 py-1 text-xs font-semibold ${job.status === "succeeded" ? "bg-emerald-50 text-emerald-700" : job.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                  {job.status}
                </span>
                <span className="text-xs text-[#66709a]">{job.resultLabel}</span>
              </div>
            ))
          )}
        </div>
      </SoftPanel>
    </div>
  );
}
