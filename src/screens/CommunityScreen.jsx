import React from "react";
import { Copy, Folder, Layers, Lock, Share2, Users } from "lucide-react";
import { createCommunity, copySharedDeckToLibrary, shareDeckToCommunity } from "../communityModel.js";
import { EmptyState, OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.jsx";

export function CommunityScreen({ decks, communities, onSaveCommunity, onSaveDeck }) {
  const [name, setName] = React.useState("Medizin Erstes Studienjahr");
  const [selectedDeckId, setSelectedDeckId] = React.useState(decks[0]?.id ?? "");
  const community = communities[0] ?? null;

  function ensureCommunity() {
    const next = community ?? createCommunity({ name });
    onSaveCommunity(next);
    return next;
  }

  function shareSelectedDeck() {
    const deck = decks.find((item) => item.id === selectedDeckId);
    if (!deck) return;
    const target = ensureCommunity();
    const result = shareDeckToCommunity(target, deck, { permission: "copy" });
    onSaveCommunity(result.community);
  }

  function copyDeck(sharedRef) {
    const sourceDeck = decks.find((deck) => deck.id === sharedRef.deckId);
    if (sourceDeck) {
      onSaveDeck(copySharedDeckToLibrary(sourceDeck));
    }
  }

  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Kleine Gruppen" title="Community" body="Ordnerbasiertes Teilen ohne Lernstandsvergleich." />
      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={Users} className="bg-emerald-50 text-emerald-700" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Community</p>
              <h3 className="text-xl font-semibold text-[#17214f]">{community?.name ?? "Neue Gruppe"}</h3>
            </div>
          </div>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Name
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <button type="button" onClick={ensureCommunity} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white">
              <Users size={17} aria-hidden="true" />
              Community sichern
            </button>
            <div className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4 text-sm text-[#66709a]">
              <Lock size={17} aria-hidden="true" />
              <p className="mt-2">Keine fremden Review-Events, Streaks, Online-Status oder Rankings.</p>
            </div>
          </div>
        </SoftPanel>

        <SoftPanel className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-[#17214f]">Ordner und geteilte Stapel</h3>
            <div className="flex flex-wrap gap-2">
              <select className="min-h-10 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1]" value={selectedDeckId} onChange={(event) => setSelectedDeckId(event.target.value)}>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={shareSelectedDeck} disabled={!selectedDeckId} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white disabled:bg-slate-300">
                <Share2 size={16} aria-hidden="true" />
                Teilen
              </button>
            </div>
          </div>
          {community ? (
            <div className="grid gap-4">
              {community.folders.map((folder) => (
                <div key={folder.id} className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#17214f]">
                    <Folder size={17} aria-hidden="true" />
                    {folder.name}
                  </div>
                  <div className="mt-3 grid gap-2">
                    {(community.sharedDecks ?? []).filter((ref) => ref.folderId === folder.id).map((ref) => (
                      <div key={ref.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3">
                        <Layers size={17} className="text-[#6672bf]" aria-hidden="true" />
                        <span className="min-w-[12rem] flex-1 text-sm font-semibold text-[#17214f]">{ref.deckName}</span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">{ref.permission}</span>
                        <button type="button" onClick={() => copyDeck(ref)} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#eef1fb] px-3 text-xs font-semibold text-[#4f5eb1]">
                          <Copy size={14} aria-hidden="true" />
                          Kopieren
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Users} title="Noch keine Community" body="Lege eine Gruppe an und teile danach Stapel in einen Ordner." />
          )}
        </SoftPanel>
      </div>
    </div>
  );
}
