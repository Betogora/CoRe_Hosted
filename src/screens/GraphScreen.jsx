import React from "react";
import { Network } from "lucide-react";
import { buildDeckGraph, shouldRefreshDeckGraph } from "../deckGraph.js";
import { EmptyState, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.jsx";

export function GraphScreen({ decks, onUpdateDeck }) {
  const [deckId, setDeckId] = React.useState(decks[0]?.id ?? "");
  const deck = decks.find((item) => item.id === deckId) ?? decks[0] ?? null;
  const graph = deck?.graph ?? null;

  React.useEffect(() => {
    if (!deckId && decks[0]) setDeckId(decks[0].id);
  }, [decks, deckId]);

  function generateGraph() {
    if (!deck) return;
    const nextGraph = buildDeckGraph(deck, { termLimit: 10 });
    onUpdateDeck(deck.id, (current) => ({ ...current, graph: nextGraph }));
  }

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Mindmap"
        title="Deck Graph"
      />
      {decks.length === 0 ? (
        <EmptyState icon={Network} title="Kein Stapel für Graph" body="Importiere oder erstelle Karten." />
      ) : (
        <>
          <SoftPanel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <select className="min-h-11 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]" value={deck?.id ?? ""} onChange={(event) => setDeckId(event.target.value)}>
                  {decks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <span className="text-sm font-semibold text-[#66709a]">Status: {graph?.status ?? "offen"} · Refresh: {shouldRefreshDeckGraph(deck) ? "fällig" : "aktuell"}</span>
              </div>
              <button type="button" onClick={generateGraph} disabled={!deck} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
                <Network size={17} aria-hidden="true" />
                Graph generieren
              </button>
            </div>
          </SoftPanel>
          <SoftPanel className="p-6">
            {graph ? (
              <div className="grid gap-6 xl:grid-cols-[1fr_0.7fr]">
                <div className="min-h-[28rem] rounded-2xl bg-[#f8f9fe] p-4">
                  <svg viewBox="0 0 720 420" className="h-full min-h-[28rem] w-full" role="img" aria-label="Deck Graph">
                    {graph.edges.map((edge) => {
                      const fromIndex = graph.nodes.findIndex((node) => node.id === edge.from);
                      const toIndex = graph.nodes.findIndex((node) => node.id === edge.to);
                      const fromAngle = (fromIndex / Math.max(1, graph.nodes.length)) * Math.PI * 2;
                      const toAngle = (toIndex / Math.max(1, graph.nodes.length)) * Math.PI * 2;
                      const from = fromIndex === 0 ? [360, 210] : [360 + Math.cos(fromAngle) * 210, 210 + Math.sin(fromAngle) * 145];
                      const to = toIndex === 0 ? [360, 210] : [360 + Math.cos(toAngle) * 210, 210 + Math.sin(toAngle) * 145];
                      return <line key={edge.id} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#c9d1ee" strokeWidth="2" />;
                    })}
                    {graph.nodes.map((node, nodeIndex) => {
                      const angle = (nodeIndex / Math.max(1, graph.nodes.length)) * Math.PI * 2;
                      const x = nodeIndex === 0 ? 360 : 360 + Math.cos(angle) * 210;
                      const y = nodeIndex === 0 ? 210 : 210 + Math.sin(angle) * 145;
                      const fill = node.type === "deck" ? "#4f5eb1" : node.type === "topic" ? "#0f766e" : "#ffffff";
                      const color = node.type === "card" ? "#17214f" : "#ffffff";
                      return (
                        <g key={node.id}>
                          <circle cx={x} cy={y} r={node.type === "deck" ? 54 : node.type === "topic" ? 38 : 30} fill={fill} stroke="#dfe4f5" strokeWidth="2" />
                          <text x={x} y={y + 4} textAnchor="middle" fill={color} fontSize="12" fontWeight="700">
                            {node.label.slice(0, 16)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div className="grid gap-3 content-start">
                  <StatTile label="Knoten" value={graph.nodes.length} />
                  <StatTile label="Kanten" value={graph.edges.length} />
                  <StatTile label="Kartenbasis" value={graph.metadata.cardCount} />
                </div>
              </div>
            ) : (
              <EmptyState icon={Network} title="Graph noch nicht generiert" body="Der Graph wird manuell oder nach Triggern aktualisiert." />
            )}
          </SoftPanel>
        </>
      )}
    </div>
  );
}
