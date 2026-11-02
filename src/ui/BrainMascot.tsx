import React from "react";
import { BRAIN_MASCOTS, type BrainMascotId } from "../brainMascots.ts";
import { attachBrainMascotInteraction } from "../brainMascotInteraction.ts";
import { brainPalette } from "../brainMascotPalette.ts";

const { ink, hand, blue, gold, mint } = brainPalette;

function Card({ x, y, rotate = 0, color = blue }: { x: number; y: number; rotate?: number; color?: string }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}><rect width="87" height="59" rx="8" fill="#fffaf1" /><path d="M16 22H68" stroke={color} strokeWidth="7" strokeLinecap="round" /><path d="M16 37H53" stroke={gold} strokeWidth="6" strokeLinecap="round" /></g>;
}

function Stack({ x, y, books = false }: { x: number; y: number; books?: boolean }) {
  return <g transform={`translate(${x} ${y})`}>
    {[mint, gold, blue].map((color, i) => <g key={color} transform={`translate(0 ${-i * 15})`}>
      <path d={`M0 0L51 -10L88 0V${books ? 15 : 11}L36 23L0 13Z`} fill={color} />
      <path d="M4 1L36 10L83 1V8L36 18L4 9Z" fill="#fff9ef" opacity=".85" />
      <path d="M0 0L51 -10L88 0L36 12Z" fill={color} />
    </g>)}
  </g>;
}

function Rays({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`} stroke={gold} strokeWidth="7" strokeLinecap="round"><path d="M0 -27V-39M23 -18L32 -27M29 7H42M-23 -18L-32 -27M-29 7H-42" /></g>;
}

function Bulb() {
  return <g transform="translate(328 65)"><Rays x={0} y={0} /><path d="M-21 -2A23 23 0 1 1 17 15Q10 22 10 30H-10Q-10 21 -17 14Z" fill={gold} /><path d="M-8 3L0 11L8 3M0 11V30" fill="none" stroke="#fff5d6" strokeWidth="5" strokeLinecap="round" /><path d="M-10 30H10V39Q0 48 -10 39Z" fill={ink} /><path d="M-10 34H10" stroke="#36698f" strokeWidth="3" /></g>;
}

function Pencil({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}><rect x="-8" y="-57" width="16" height="88" rx="4" fill={gold} /><path d="M0 -43V31H8V-43Z" fill="#e9a44e" /><rect x="-8" y="-57" width="16" height="17" rx="4" fill="#a9c7de" /><path d="M-8 31L0 49L8 31Z" fill="#ead3ae" /><path d="M-3 43L0 49L3 43Z" fill={ink} /></g>;
}

function Star({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <path transform={`translate(${x} ${y}) scale(${scale})`} d="M0 -17L5 -5L17 -3L8 6L10 19L0 12L-10 19L-8 6L-17 -3L-5 -5Z" fill={gold} />;
}

function Artwork({ id, prefix }: { id: BrainMascotId; prefix: string }) {
  const mascot = BRAIN_MASCOTS.find((entry) => entry.id === id)!;
  const scene = mascot.scene;
  const adventure = mascot.collection === "adventure";
  const closed = ["quiet", "meditate", "focus", "sleep"].includes(scene);
  const happy = ["correct", "celebrate"].includes(scene);
  const sad = scene === "wrong";
  const running = ["run", "carry", "progress"].includes(scene);
  const sitting = ["cards", "quiet", "meditate", "sleep", "focus", "read", "write", "work"].includes(scene);
  const thinking = ["think", "question", "plan", "idea"].includes(scene);
  const square = "tile" in mascot;
  const background = scene === "run" ? "#e4eef6" : ["idea", "notes", "shield"].includes(scene) ? "#fcf1d7" : "#ebf3f9";
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 360" role="img" aria-labelledby={`${prefix}-title ${prefix}-desc`}>
    <title id={`${prefix}-title`}>{mascot.title}</title><desc id={`${prefix}-desc`}>{mascot.description}</desc>
    <defs>
      <linearGradient id={`${prefix}-brain`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor={adventure ? brainPalette.brainLight : "#f4aa96"} /><stop offset="1" stopColor="#e68b72" /></linearGradient>
      <linearGradient id={`${prefix}-fold`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={brainPalette.fold} /><stop offset="1" stopColor={brainPalette.foldDeep} /></linearGradient>
      <linearGradient id={`${prefix}-shoe`} x2=".7" y2="1"><stop stopColor={brainPalette.inkSoft} /><stop offset="1" stopColor={ink} /></linearGradient>
      <clipPath id={`${prefix}-left-eye`}><ellipse cx="210" cy="187" rx="19" ry="26" /></clipPath>
      <clipPath id={`${prefix}-right-eye`}><ellipse cx="270" cy="181" rx="18" ry="25" /></clipPath>
    </defs>
    {square ? <rect x="16" y="12" width="368" height="336" rx={id === "pastell-app" ? 82 : 55} fill={background} /> : null}
    <ellipse cx="203" cy="315" rx="129" ry="13" fill="#9cb5c8" opacity=".23" />
    {scene === "idea" || id === "pastell-aha" ? <Bulb /> : null}
    {scene === "calendar" ? <g transform="translate(266 47)"><rect width="96" height="102" rx="12" fill="#ebf3f9" /><path d="M0 23Q0 0 12 0H84Q96 0 96 23V29H0Z" fill={blue} /><path d="M24 -7V12M72 -7V12" stroke="#4a7fab" strokeWidth="10" strokeLinecap="round" />{[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <circle key={`${r}-${c}`} cx={23 + c * 25} cy={49 + r * 21} r="6" fill={r === 1 && c === 1 ? gold : "#c3d9e8"} />))}</g> : null}
    {scene === "due" ? <g transform="translate(303 70) rotate(8)"><path d="M-22 0Q-22 24 -5 36Q-22 49 -22 76H22Q22 49 5 36Q22 24 22 0Z" fill="#d9e6f0" /><path d="M-13 11H13L0 30Z" fill="#a9c7de" /><path d="M-15 67L0 45L15 67Z" fill="#a9c7de" /><path d="M-25 0H25M-25 76H25" stroke="#6390b5" strokeWidth="10" strokeLinecap="round" /></g> : null}
    {scene === "progress" ? <g transform="translate(76 311)">{[18, 38, 60, 84].map((height, i) => <rect key={height} x={i * 60} y={-height} width="43" height={height} rx="6" fill={i === 3 ? "#93b8d4" : "#d6e4ee"} />)}<path d="M198 -105L231 -137M210 -137H231V-116" fill="none" stroke="#a9c7de" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /></g> : null}
    {scene === "focus" ? <path d="M89 197V160A111 111 0 0 1 311 160V197" stroke="#2f6a95" strokeWidth="14" fill="none" /> : null}
    {scene === "wrong" ? <g fill="#8fb5d2"><path d="M302 49C286 34 270 46 274 59C255 56 251 81 269 85H319C343 82 338 56 322 59C324 39 307 34 302 49Z" /><circle cx="298" cy="99" r="5" /></g> : null}
    {scene === "plan" ? <g fill="#ebf3f9"><path d="M290 39C266 23 241 44 250 65C228 77 245 104 267 98C290 117 319 100 317 81C343 64 320 32 304 42Z" /><circle cx="253" cy="113" r="7" /><circle cx="245" cy="129" r="4" /><g fill="#6390b5">{[268, 285, 302].map((x) => <circle key={x} cx={x} cy="70" r="5" />)}</g></g> : null}
    {(scene === "think" || scene === "question") ? <text x={adventure ? 71 : 306} y="85" fill={brainPalette.blueDeep} fontSize="67" fontFamily="sans-serif" fontWeight="700">?</text> : null}
    {scene === "quiet" ? <g transform="translate(61 88)"><circle r="31" fill="#fffaf4" stroke="#3d7aa5" strokeWidth="7" /><path d="M0 -18V1L13 6" fill="none" stroke="#3d7aa5" strokeWidth="6" strokeLinecap="round" /></g> : null}
    {scene === "run" || scene === "carry" ? <g stroke="#c9dbe8" strokeWidth="7" strokeLinecap="round"><path d="M43 182H68M30 206H58M45 231H70" /></g> : null}
    {/* Legs remain behind the brain; each pose has its own silhouette. */}
    <g transform={scene === "progress" ? "translate(24 -22) scale(.82)" : undefined}>
    <g fill={`url(#${prefix}-shoe)`}>
      {scene === "meditate" || scene === "sleep" ? <><path d="M155 278Q121 294 158 310L228 308Q244 290 213 285Z" /><path d="M244 278Q279 294 241 310L174 308Q159 291 187 285Z" /></> : sitting ? <><path d="M166 276L145 290Q120 267 115 285Q110 303 147 313Q170 317 180 284Z" /><path d="M226 279L246 292Q270 268 276 285Q283 306 245 314Q221 317 213 287Z" /></> : running ? <><path d="M169 266L147 287L121 271Q102 271 113 290L143 307Q154 312 164 300L189 278Z" /><path d="M225 267L252 287L274 281Q292 291 276 300L245 304Q238 305 232 296L211 280Z" /></> : <><path d="M166 267L159 300H148Q132 315 157 317H178L187 274Z" /><path d="M225 268L232 300H248Q270 315 244 317H222L207 275Z" /></>}
    </g>
    {scene === "celebrate" || scene === "correct" ? <g fill="none" stroke={hand} strokeWidth="15" strokeLinecap="round"><path d="M114 236Q76 222 77 180" /><path d="M283 224Q327 194 328 149" /></g> : null}
    <path d="M113 257C87 259 68 238 73 215C50 199 56 166 79 155C69 130 87 105 112 104C120 76 147 64 171 75C190 49 228 55 244 77C275 67 301 86 303 112C334 116 347 145 333 168C358 187 351 220 329 230C329 258 300 276 275 268C257 292 227 292 205 280C179 297 147 285 143 272C128 277 116 269 113 257Z" fill={`url(#${prefix}-brain)`} />
    <g fill="none" stroke={`url(#${prefix}-fold)`} strokeWidth="12" strokeLinecap="round" opacity=".7">
      <path d="M171 75Q163 91 183 100Q202 107 198 120M240 88Q267 85 272 109Q276 124 289 120M116 113Q138 102 148 119M104 143Q82 137 79 155M159 145Q139 127 124 148M114 170Q92 177 103 198Q108 207 120 204M80 215Q90 205 97 219M142 216Q126 239 149 250M195 135Q214 145 224 128M308 141Q326 143 326 156M276 249Q291 243 292 229M180 256Q173 270 185 277" />
    </g>
    <g fill="#f6bba9" opacity=".42"><ellipse cx="174" cy="92" rx="18" ry="9" transform="rotate(-12 174 92)" /><ellipse cx="104" cy="128" rx="10" ry="16" transform="rotate(27 104 128)" /><ellipse cx="239" cy="78" rx="15" ry="6" /></g>
    {closed || happy ? <g stroke={ink} strokeWidth="7" fill="none" strokeLinecap="round"><path d={happy ? "M196 187Q208 166 220 187" : "M196 185Q208 203 220 185"} /><path d={happy ? "M254 181Q266 160 278 181" : "M254 180Q266 198 278 180"} /></g> : <>
      <g fill="none" stroke="#a3533f" strokeWidth="7" strokeLinecap="round"><path d={sad ? "M194 152Q207 162 219 149" : "M195 156Q206 146 217 152"} /><path d={sad ? "M254 148Q267 158 279 146" : "M255 150Q266 140 277 147"} /></g>
      <ellipse cx="210" cy="187" rx="19" ry="26" fill="#fffdf8" />
      <g clipPath={`url(#${prefix}-left-eye)`}><g data-brain-pupil="left"><ellipse cx="215" cy="192" rx="11" ry="17" fill={ink} /><ellipse cx="218" cy="184" rx="3.5" ry="5" fill="#fff" opacity=".7" /></g></g>
      {scene === "wink" ? <path d="M253 185Q267 169 280 181L257 190" fill="none" stroke={ink} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /> : <><ellipse cx="270" cy="181" rx="18" ry="25" fill="#fffdf8" /><g clipPath={`url(#${prefix}-right-eye)`}><g data-brain-pupil="right"><ellipse cx="275" cy="186" rx="10.5" ry="16.5" fill={ink} /><ellipse cx="278" cy="178" rx="3.5" ry="5" fill="#fff" opacity=".7" /></g></g></>}
    </>}
    <ellipse cx="183" cy="219" rx="13" ry="7" fill="#e07d68" opacity=".6" /><ellipse cx="294" cy="208" rx="11" ry="6" fill="#e07d68" opacity=".6" />
    {happy || scene === "run" ? <g><path d="M222 216Q240 226 259 212Q259 243 239 244Q224 241 222 216Z" fill={ink} /><path d="M229 236Q240 224 253 235Q244 249 229 236Z" fill="#de7f6c" /></g> : <path d={sad ? "M229 228Q240 217 250 225" : thinking ? "M233 228L245 225" : "M227 222Q240 234 251 218"} fill="none" stroke={hand} strokeWidth="6" strokeLinecap="round" />}
    </g>
    {/* Scene accessories are original vectors, kept separate from eyes and body. */}
    {scene === "decks" ? <g transform="translate(303 138) rotate(4)"><rect width="86" height="115" rx="12" fill="#f6efe7" />{[0, 1, 2].map((i) => <g key={i} transform={`translate(12 ${26 + i * 29})`}><rect width="13" height="13" rx="4" fill={brainPalette.blueMist} /><path d="M25 7H54" stroke="#b0cbe0" strokeWidth="6" strokeLinecap="round" /></g>)}<path d="M-25 112L4 95" stroke={hand} strokeWidth="13" strokeLinecap="round" /></g> : null}
    {scene === "cards" || scene === "quiet" || (scene === "question" && adventure) ? <><path d="M145 246Q159 273 193 275" fill="none" stroke={hand} strokeWidth="14" strokeLinecap="round" /><Card x={185} y={231} rotate={-9} /><ellipse cx="187" cy="270" rx="11" ry="16" transform="rotate(-25 187 270)" fill={hand} /><ellipse cx="267" cy="251" rx="10" ry="15" transform="rotate(25 267 251)" fill={hand} /></> : null}
    {adventure && ["cards", "question", "correct", "think", "write", "quiet", "celebrate"].includes(scene) ? <Stack x={scene === "cards" || scene === "quiet" || scene === "celebrate" ? 24 : 292} y={312} books /> : null}
    {scene === "correct" || (scene === "wink" && adventure) ? <><Card x={300} y={77} rotate={12} color={mint} /><ellipse cx="325" cy="143" rx="11" ry="15" fill={hand} /><Rays x={67} y={104} /></> : null}
    {scene === "wink" && !adventure ? <><Pencil x={100} y={247} rotate={-38} /><path d="M146 239L115 249" stroke={hand} strokeWidth="15" strokeLinecap="round" /></> : null}
    {thinking ? <g stroke={hand} strokeWidth="14" fill="none" strokeLinecap="round"><path d="M151 242Q163 278 211 251L222 235" />{scene === "idea" || (!adventure && scene === "question") ? <path d="M301 225Q329 207 331 173" /> : null}</g> : null}
    {scene === "work" ? <><g transform="translate(0 7)"><path d="M197 287L224 222H333L310 297H174L161 288Z" fill="#5f8db2" /><path d="M224 222H333L310 289H203Z" fill="#7fa8c8" /><ellipse cx="271" cy="258" rx="9" ry="11" fill="#4a83ad" /></g><path d="M144 270Q159 285 193 285" fill="none" stroke={hand} strokeWidth="13" strokeLinecap="round" />{adventure ? <><Stack x={28} y={307} books /><g transform="translate(348 262)"><path d="M0 0Q-27 -26 -24 -57Q2 -48 0 0M1 -7Q-1 -45 25 -66Q32 -27 1 -7" fill={mint} /><path d="M-19 0H21L16 45H-13Z" fill="#f4ede4" /></g></> : <g transform="translate(71 275)"><path d="M0 0H32V28Q16 39 0 28Z" fill={blue} /><path d="M1 4H-8Q-20 14 -8 23H1" fill="none" stroke={blue} strokeWidth="6" /></g>}</> : null}
    {scene === "carry" ? <><Stack x={243} y={265} /><path d="M194 238Q207 282 273 278" stroke={hand} strokeWidth="14" fill="none" strokeLinecap="round" /></> : null}
    {scene === "write" ? <><Card x={175} y={293} rotate={-5} /><Pencil x={168} y={252} rotate={-28} /><ellipse cx="158" cy="259" rx="12" ry="16" fill={hand} /><ellipse cx="255" cy="282" rx="12" ry="8" fill={hand} /></> : null}
    {scene === "notes" ? <><Pencil x={309} y={211} rotate={32} /><path d="M273 247L292 247" fill="none" stroke={hand} strokeWidth="16" strokeLinecap="round" /></> : null}
    {scene === "read" ? <><g fill="none" stroke="#2f6a95" strokeWidth="6"><circle cx="210" cy="187" r="28" /><circle cx="270" cy="181" r="27" /><path d="M238 181H244M181 182L167 176M298 177L311 170" /></g><path d="M148 252Q187 241 222 261Q254 236 293 247L280 307Q252 300 222 317Q184 302 157 308Z" fill="#6a96b8" /><path d="M222 261V308M162 259Q186 255 210 269M238 267L279 255" fill="none" stroke="#c3d4e0" strokeWidth="5" /><ellipse cx="157" cy="280" rx="10" ry="15" fill={hand} /><ellipse cx="283" cy="272" rx="10" ry="15" fill={hand} /></> : null}
    {scene === "focus" ? <g fill={brainPalette.blue} stroke="#2f6a95" strokeWidth="4"><rect x="76" y="164" width="35" height="66" rx="17" /><rect x="310" y="156" width="30" height="63" rx="15" /></g> : null}
    {scene === "graduate" ? <g><path d="M118 77L206 44L293 68L204 106Z" fill={ink} /><path d="M149 87L151 117Q200 100 252 108L254 83L204 106Z" fill="#2d4a5f" /><path d="M280 73V119" stroke={gold} strokeWidth="4" /><path d="M274 118L270 138H289L284 118Z" fill={gold} /></g> : null}
    {scene === "shield" ? <><path d="M287 208Q312 210 338 200L350 251Q341 286 315 300Q285 282 281 250Z" fill="#5b93c2" /><path d="M315 215L338 210L344 250Q337 276 315 290Z" fill="#3f7db0" /><Star x={316} y={246} scale={1.05} /><path d="M268 252L285 249" stroke={hand} strokeWidth="14" strokeLinecap="round" /></> : null}
    {scene === "trophy" ? <g transform="translate(321 125)"><path d="M-24 -18H24L20 18Q0 45 -20 18Z" fill={gold} /><path d="M-24 -10H-37Q-40 13 -19 14M24 -10H37Q40 13 19 14" fill="none" stroke={gold} strokeWidth="7" /><path d="M0 30V48M-18 50H18" stroke="#e9ad4c" strokeWidth="8" strokeLinecap="round" /><path d="M-31 105Q-11 90 -9 62" stroke={hand} strokeWidth="14" fill="none" strokeLinecap="round" /></g> : null}
    {scene === "search" ? <><rect x="50" y="260" width="304" height="62" rx="31" fill="#ebf3f9" /><circle cx="85" cy="287" r="12" fill="none" stroke="#6a96b8" strokeWidth="6" /><path d="M95 297L108 309" stroke="#6a96b8" strokeWidth="6" strokeLinecap="round" /><ellipse cx="181" cy="260" rx="11" ry="7" fill={hand} /><ellipse cx="281" cy="260" rx="11" ry="7" fill={hand} /></> : null}
    {scene === "wrong" ? <Card x={278} y={286} rotate={-4} /> : null}
    {scene === "due" ? <Stack x={292} y={309} /> : null}
    {scene === "sleep" ? <text x="282" y="96" fill="#5f8db2" fontFamily="sans-serif" fontWeight="700" fontSize="28" transform="rotate(-8 282 96)">z<tspan dy="-13" fontSize="33">z</tspan><tspan dy="-14" fontSize="38">Z</tspan></text> : null}
    {scene === "meditate" ? <><path d="M135 246Q128 282 166 279M285 244Q294 279 259 279" fill="none" stroke={hand} strokeWidth="14" strokeLinecap="round" /><Star x={65} y={187} scale={.6} /><Star x={335} y={155} scale={.7} /><Star x={350} y={202} scale={.45} /></> : null}
    {scene === "celebrate" ? <>{adventure ? <g transform="translate(342 80)"><circle r="28" fill={mint} /><path d="M-13 0L-3 10L15 -12" fill="none" stroke="#fffaf1" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></g> : <g strokeWidth="7" strokeLinecap="round"><path d="M57 114L47 100M102 73L97 54" stroke={blue} /><path d="M342 104L350 84M311 69L321 50" stroke={gold} /><path d="M58 154L43 149M352 155L367 145" stroke={brainPalette.brain} /></g>}</> : null}
  </svg>;
}

export function BrainMascot({ id, interactive = false }: { id: BrainMascotId; interactive?: boolean }) {
  const host = React.useRef<HTMLDivElement>(null);
  const prefix = `brain-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  React.useEffect(() => {
    if (!interactive || !host.current) return;
    return attachBrainMascotInteraction(host.current, host.current.closest<HTMLElement>("[data-brain-zone]") ?? host.current);
  }, [id, interactive]);
  const drawing = <span className="brain-mascot-drawing"><Artwork id={id} prefix={prefix} /></span>;
  return <div className="brain-mascot" data-brain-mascot={id} ref={host}>
    {interactive ? <button type="button" className="brain-mascot-button" aria-label="Gehirn begrüßen" aria-describedby={`${prefix}-hint`}>{drawing}</button> : drawing}
    {interactive ? <><span id={`${prefix}-hint`} className="brain-mascot-hint">Tipp mich an</span><span className="brain-mascot-feedback" data-brain-feedback="" role="status" /></> : null}
  </div>;
}
