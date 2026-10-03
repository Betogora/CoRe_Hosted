"""Vergleichsseite für visual-ab-review.

  python build.py rank <shots> [A B]        Szenen nach Anteil geänderter Pixel (Pillow nötig, sonst nur gleich/geändert)
  python build.py page <spec.json> <out.html>  baut eine einzelne HTML mit eingebetteten Bildern

Bilder liegen unter <shots>/<variante>/<ansicht>/<szene>.png (so legt scenes.mjs sie ab).
Spec (Pfade relativ zur Spec, unbekannte Felder sind Fehler):
{
  "title": "UI vereinheitlichen",            Pflicht
  "intro": "ein Satz Kontext",               optional
  "shots": "shots",                          Pflicht, Ordner mit den Varianten
  "view": "mobile",                          Pflicht, Standardansicht der Szenen
  "variants": [{"key": "A", "label": "vorher"}, {"key": "B", "label": "nachher"}],   optional, das ist der Standard
  "matrix": false,                           optional: true hängt einen Reiter mit allen Szenen x Ansichten an
  "cases": [{
    "id": "K1", "title": "…", "lead": "1–3 Sätze: was und warum",          Pflicht
    "kind": "Komponente",                                                  optional
    "variants": [...],                                                     optional, überschreibt die globalen
    "points": {"A": ["Stichpunkt mit Zahl"], "B": ["…"]},                  optional
    "scenes": [{"scene": "startseite", "note": "worauf achten", "view": "mobile"}]   Pflicht, view optional
  }]
}
"""
import base64, html, io, json, sys
from pathlib import Path

DEFAULT_VARIANTS = [{"key": "A", "label": "vorher"}, {"key": "B", "label": "nachher"}]
SPEC_KEYS = {"title", "intro", "shots", "view", "variants", "matrix", "cases"}
CASE_KEYS = {"id", "title", "lead", "kind", "variants", "points", "scenes"}
SCENE_KEYS = {"scene", "note", "view"}


def fail(msg):
    sys.exit(f"Fehler: {msg}")


def check_keys(obj, allowed, required, where):
    if not isinstance(obj, dict):
        fail(f"{where} muss ein Objekt sein")
    if unknown := set(obj) - allowed:
        fail(f"{where}: unbekannte Felder {sorted(unknown)}")
    if missing := [k for k in required if k not in obj]:
        fail(f"{where}: fehlende Felder {missing}")


def embed(path):
    try:
        from PIL import Image
        img = Image.open(path)
        if img.width > 900:
            img = img.resize((900, round(img.height * 900 / img.width)))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "WEBP", quality=82)
        return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def rank(shots, a="A", b="B"):
    shots = Path(shots)
    rows = []
    for pa in sorted((shots / a).glob("*/*.png")):
        pb = shots / b / pa.relative_to(shots / a)
        if not pb.exists():
            continue
        try:
            from PIL import Image, ImageChops
            ia, ib = Image.open(pa).convert("L"), Image.open(pb).convert("L")
            if ia.size != ib.size:
                share = 100.0
            else:
                diff = ImageChops.difference(ia, ib).point(lambda v: 255 if v > 24 else 0)
                share = 100 * diff.histogram()[255] / (ia.width * ia.height)
        except ImportError:
            share = 0.0 if pa.read_bytes() == pb.read_bytes() else -1
        rows.append((share, f"{pa.parent.name}/{pa.stem}"))
    for share, name in sorted(rows, key=lambda r: (r[0] != 0, abs(r[0])), reverse=True):
        print(f"{'geändert' if share < 0 else f'{share:5.1f} %'}  {name}")


def page(spec_path, out):
    spec_path = Path(spec_path).resolve()
    spec = json.loads(spec_path.read_text(encoding="utf8"))
    check_keys(spec, SPEC_KEYS, ["title", "shots", "view", "cases"], "Spec")
    shots = spec_path.parent / spec["shots"]
    images = {}

    def image(key, view, scene):
        path = shots / key / view / f"{scene}.png"
        if not path.exists():
            fail(f"Bild fehlt: {path}")
        ref = f"{key}/{view}/{scene}"
        images.setdefault(ref, embed(path))
        return ref

    spec.setdefault("variants", DEFAULT_VARIANTS)
    seen = set()
    for i, case in enumerate(spec["cases"]):
        where = f"Fall {i + 1}"
        check_keys(case, CASE_KEYS, ["id", "title", "lead", "scenes"], where)
        if case["id"] in seen:
            fail(f"{where}: doppelte id {case['id']}")
        seen.add(case["id"])
        case.setdefault("variants", spec["variants"])
        keys = [v["key"] for v in case["variants"]]
        for k in case.get("points", {}):
            if k not in keys:
                fail(f"{where}: points für unbekannte Variante {k}")
        for j, scene in enumerate(case["scenes"]):
            check_keys(scene, SCENE_KEYS, ["scene"], f"{where}, Szene {j + 1}")
            view = scene.get("view", spec["view"])
            scene["view"] = view
            scene["images"] = {k: image(k, view, scene["scene"]) for k in keys}
    if spec.get("matrix"):
        first = spec["variants"][0]["key"]
        spec["matrix"] = sorted({(p.stem, p.parent.name) for p in (shots / first).glob("*/*.png")})
        for scene, view in spec["matrix"]:
            for v in spec["variants"]:
                image(v["key"], view, scene)
    spec["images"] = images
    data = json.dumps(spec, ensure_ascii=False).replace("</", "<\\/")
    out = Path(out)
    out.write_text(TEMPLATE.replace("__TITLE__", html.escape(spec["title"])).replace("__DATA__", data), encoding="utf8")
    print(f"{out} ({out.stat().st_size // 1024} KB, {len(spec['cases'])} Fälle, {len(images)} Bilder)")


TEMPLATE = r"""<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
:root{--ground:#f3f5f0;--surface:#fff;--ink:#17241d;--ink-2:#45524a;--ink-3:#6b786f;--rule:#dde5de;--accent:#176644;--accent-wash:#e1f0e6;--warn:#90600f;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:var(--ground);color:var(--ink);font:400 15px/1.55 "Segoe UI",system-ui,-apple-system,sans-serif}
header{position:sticky;top:0;z-index:10;display:flex;gap:12px;align-items:center;padding:10px max(16px,calc((100vw - 1180px)/2));background:var(--surface);border-bottom:1px solid var(--rule)}
header h1{margin:0;font-size:16px;white-space:nowrap}.tabs{flex:1;display:flex;gap:4px;overflow-x:auto;min-width:0}
button{font:600 13px/1 inherit;cursor:pointer}.tabs button,.mode button{flex:1 0 auto;height:30px;padding:0 10px;border:1px solid var(--rule);border-radius:8px;background:var(--surface);color:var(--ink-3)}
.tabs button.done{background:var(--accent-wash);color:var(--accent);border-color:var(--accent)}.tabs button[aria-current]{outline:2px solid var(--ink);outline-offset:1px}
.mode{display:flex;gap:4px}.mode button[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
main{max-width:1180px;margin:0 auto;padding:24px 16px 120px}.intro{margin:0 0 20px;padding:14px 18px;border:1px solid var(--rule);border-radius:12px;background:var(--surface);color:var(--ink-2)}
.case{display:none}.case.on{display:block}.eyebrow{color:var(--ink-3);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
h2{margin:4px 0 6px;font-size:26px;line-height:1.2}.lead{margin:0;max-width:72ch;color:var(--ink-2)}
.points{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:16px 0 22px}
.point{padding:12px 14px;border:1px solid var(--rule);border-radius:12px;background:var(--surface)}.point b{display:block;margin-bottom:4px;font-size:13px}.point ul{margin:0;padding-left:18px;color:var(--ink-2)}
.scene{margin:0 0 28px}.scene h3{margin:0 0 2px;font-size:16px}.scene p{margin:0 0 10px;color:var(--ink-2)}
.row{display:grid;grid-template-columns:repeat(var(--n),minmax(0,390px));gap:18px}figure{margin:0}figcaption{margin-bottom:6px;font-weight:700;font-size:13px}
figure img{display:block;width:100%;border:1px solid var(--rule);border-radius:14px;background:var(--surface);cursor:zoom-in}
body.toggle .row{grid-template-columns:minmax(0,390px)}body.toggle figure:not(.shown){display:none}body.toggle figure img{cursor:pointer}
body.toggle figcaption::after{content:"  · Klick wechselt";font-weight:400;color:var(--ink-3)}
.bar{position:sticky;bottom:0;display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px -16px 0;padding:14px 16px;background:color-mix(in srgb,var(--ground) 92%,transparent);backdrop-filter:blur(6px);border-top:1px solid var(--rule)}
.bar button,.bar input{height:42px;border:1px solid var(--rule);border-radius:10px;background:var(--surface);padding:0 14px}
.bar button[aria-pressed=true]{background:var(--accent-wash);border-color:var(--accent);color:var(--accent)}.bar input{flex:1 1 240px;font:400 14px inherit}
.bar .next{margin-left:auto;background:var(--accent);border-color:var(--accent);color:#fff}
table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--rule)}td,th{padding:9px 12px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}
textarea{width:100%;min-height:180px;margin-top:14px;padding:12px;border:1px solid var(--rule);border-radius:12px;font:13px/1.5 ui-monospace,Consolas,monospace}.open{color:var(--warn);font-weight:600}
dialog{padding:0;border:0;background:transparent;max-width:96vw}dialog::backdrop{background:rgb(23 36 29/.6)}dialog img{max-height:92vh;border-radius:14px}
@media(max-width:760px){.row{gap:8px}header h1{display:none}}
</style></head><body>
<header><h1>__TITLE__</h1><nav class="tabs" id="tabs"></nav><div class="mode" role="group" aria-label="Vergleich"><button type="button" data-mode="side">Nebeneinander</button><button type="button" data-mode="toggle">Umschalten</button></div></header>
<main id="main"></main><dialog id="zoom"><img alt=""></dialog>
<script>
const S = __DATA__, C = S.cases, IMG = S.images, KEY = "ab-review:" + S.title, M = Array.isArray(S.matrix) && S.matrix.length;
let st = {}; try { st = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const label = (c, k) => (c.variants.find((v) => v.key === k) || {}).label || k;
const row = (variants, refs, alt) => `<div class="row" style="--n:${variants.length}">${variants.map((v, i) => `<figure class="${i ? "" : "shown"}"><figcaption>${e(v.key)} · ${e(v.label)}</figcaption><img src="${IMG[refs[v.key]]}" alt="${e(alt)}, ${e(v.label)}"></figure>`).join("")}</div>`;
const RESULT = C.length + (M ? 1 : 0);
let cur = 0;
document.getElementById("main").innerHTML = (S.intro ? `<p class="intro">${e(S.intro)}</p>` : "") + C.map((c, i) => `
<section class="case" data-i="${i}">
  <span class="eyebrow">Entscheidung ${i + 1} von ${C.length} · ${e(c.id)}${c.kind ? " · " + e(c.kind) : ""}</span>
  <h2>${e(c.title)}</h2><p class="lead">${e(c.lead)}</p>
  ${c.points ? `<div class="points">${c.variants.map((v) => c.points[v.key] ? `<div class="point"><b>${e(v.key)} · ${e(v.label)}</b><ul>${c.points[v.key].map((p) => `<li>${e(p)}</li>`).join("")}</ul></div>` : "").join("")}</div>` : ""}
  ${c.scenes.map((s) => `<div class="scene"><h3>${e(s.scene)} · ${e(s.view)}</h3>${s.note ? `<p>${e(s.note)}</p>` : ""}${row(c.variants, s.images, s.scene)}</div>`).join("")}
  <div class="bar">${c.variants.map((v) => `<button type="button" data-pick="${e(v.key)}">${e(v.key)} · ${e(v.label)}</button>`).join("")}
    <input data-note placeholder="Notiz (optional)" value="${e(st[c.id]?.note)}"><button type="button" data-go="${i - 1}" ${i ? "" : "disabled"}>Zurück</button><button type="button" class="next" data-go="${i + 1}">Weiter</button></div>
</section>`).join("") + (M ? `<section class="case" data-i="${C.length}"><span class="eyebrow">Matrix</span><h2>Alle Szenen und Ansichten</h2><p class="lead">Nur zum Ansehen, ohne Entscheidung.</p>
  ${S.matrix.map(([scene, view]) => `<div class="scene"><h3>${e(scene)} · ${e(view)}</h3>${row(S.variants, Object.fromEntries(S.variants.map((v) => [v.key, `${v.key}/${view}/${scene}`])), scene)}</div>`).join("")}
  <div class="bar"><button type="button" data-go="${C.length - 1}">Zurück</button><button type="button" class="next" data-go="${RESULT}">Weiter</button></div></section>` : "")
  + `<section class="case" data-i="${RESULT}"><span class="eyebrow">Ergebnis</span><h2>Entscheidungen</h2>
  <table><thead><tr><th>ID</th><th>Entscheidung</th><th>Wahl</th><th>Notiz</th></tr></thead><tbody id="sum"></tbody></table>
  <textarea id="out" readonly></textarea><div class="bar"><button type="button" data-go="${RESULT - 1}">Zurück</button><button type="button" class="next" id="copy">Prompt kopieren</button></div></section>`;
function render() {
  document.getElementById("tabs").innerHTML = C.map((c, i) => `<button type="button" data-go="${i}" class="${st[c.id]?.pick ? "done" : ""}" ${i === cur ? 'aria-current="step"' : ""} title="${e(c.title)}">${e(c.id)}${st[c.id]?.pick ? " · " + e(st[c.id].pick) : ""}</button>`).join("")
    + (M ? `<button type="button" data-go="${C.length}" ${cur === C.length ? 'aria-current="step"' : ""}>Matrix</button>` : "")
    + `<button type="button" data-go="${RESULT}" ${cur === RESULT ? 'aria-current="step"' : ""}>Ergebnis</button>`;
  document.querySelectorAll(".case").forEach((el) => el.classList.toggle("on", +el.dataset.i === cur));
  document.querySelectorAll(".case").forEach((el) => { const c = C[+el.dataset.i]; if (c) el.querySelectorAll("[data-pick]").forEach((b) => b.setAttribute("aria-pressed", String(st[c.id]?.pick === b.dataset.pick))); });
  document.body.classList.toggle("toggle", st._mode === "toggle");
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String((st._mode || "side") === b.dataset.mode)));
  document.getElementById("sum").innerHTML = C.map((c) => `<tr><td>${e(c.id)}</td><td>${e(c.title)}</td><td>${st[c.id]?.pick ? e(st[c.id].pick + " · " + label(c, st[c.id].pick)) : '<span class="open">offen</span>'}</td><td>${e(st[c.id]?.note)}</td></tr>`).join("");
  document.getElementById("out").value = `Entscheidungen zu „${S.title}“. Setze sie so um; offene Punkte bitte nachfragen:\n` + C.map((c) => `- ${c.id} ${c.title}: ${st[c.id]?.pick ? st[c.id].pick + " (" + label(c, st[c.id].pick) + ")" : "offen"}${st[c.id]?.note ? " — " + st[c.id].note : ""}`).join("\n");
}
const go = (i) => { cur = Math.max(0, Math.min(RESULT, i)); render(); scrollTo({ top: 0 }); };
const pick = (k) => { const c = C[cur]; if (!c || !c.variants.some((v) => v.key === k)) return; st[c.id] = { ...st[c.id], pick: k }; save(); render(); setTimeout(() => go(cur + 1), 350); };
addEventListener("click", (ev) => {
  const t = ev.target.closest("button,img"); if (!t) return;
  if (t.tagName === "IMG" && st._mode === "toggle") { const f = t.closest("figure"), figs = [...f.parentElement.children]; f.classList.remove("shown"); figs[(figs.indexOf(f) + 1) % figs.length].classList.add("shown"); }
  else if (t.tagName === "IMG") { const d = document.getElementById("zoom"); d.firstChild.src = t.src; d.showModal(); }
  else if (t.dataset.mode) { st._mode = t.dataset.mode; save(); render(); }
  else if (t.dataset.pick) pick(t.dataset.pick);
  else if (t.dataset.go) go(+t.dataset.go);
  else if (t.id === "copy") { const o = document.getElementById("out"); o.select(); navigator.clipboard?.writeText(o.value); t.textContent = "Kopiert"; }
});
document.getElementById("zoom").onclick = (ev) => ev.currentTarget.close();
addEventListener("input", (ev) => { if (!ev.target.matches?.("[data-note]")) return; const c = C[cur]; st[c.id] = { ...st[c.id], note: ev.target.value }; save(); render(); });
addEventListener("keydown", (ev) => {
  if (ev.target.matches?.("input,textarea")) return;
  if (ev.key === "ArrowRight") go(cur + 1); else if (ev.key === "ArrowLeft") go(cur - 1); else pick(ev.key.toUpperCase());
});
render();
</script></body></html>"""

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "rank" and len(sys.argv) >= 3:
        rank(*sys.argv[2:5])
    elif cmd == "page" and len(sys.argv) == 4:
        page(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
