/** Shared by the React host and the generated, standalone HTML previews. */
export function attachBrainMascotInteraction(host: HTMLElement, zone: HTMLElement = host): () => void {
  const button = host.querySelector<HTMLButtonElement>("button");
  if (!button) return () => undefined;
  const pupils = [...host.querySelectorAll<SVGGElement>("[data-brain-pupil]")];
  const drawing = host.querySelector<HTMLElement>(".brain-mascot-drawing")!;
  const feedback = host.querySelector<HTMLElement>("[data-brain-feedback]")!;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let timer = 0;
  let animation: Animation | undefined;
  let x = 0, y = 0;
  let pointer: { x: number; y: number } | null = null;
  function paint() {
    frame = 0;
    if (pointer) {
      // One layout read per frame, however often the pointer reports.
      const rect = drawing.getBoundingClientRect();
      const dx = (pointer.x - rect.left - rect.width / 2) / Math.max(rect.width / 2, 1);
      const dy = (pointer.y - rect.top - rect.height / 2) / Math.max(rect.height / 2, 1);
      const distance = Math.max(1, Math.hypot(dx, dy));
      x = dx / distance * 5; y = dy / distance * 5;
    }
    for (const pupil of pupils) pupil.setAttribute("transform", `translate(${x} ${y})`);
  }
  function reset() {
    x = 0; y = 0; pointer = null;
    if (frame) window.cancelAnimationFrame(frame);
    paint();
  }
  function follow(event: PointerEvent) {
    if (event.pointerType === "touch" || reduced.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    if (!frame) frame = window.requestAnimationFrame(paint);
  }
  function react() {
    animation?.cancel();
    window.clearTimeout(timer);
    feedback.textContent = "Schön, dass du da bist!";
    if (!reduced.matches) animation = drawing.animate([
      { transform: "translateY(0) rotate(0)" },
      { transform: "translateY(-10px) rotate(-5deg)", offset: .35 },
      { transform: "translateY(-4px) rotate(4deg)", offset: .65 },
      { transform: "translateY(0) rotate(0)" },
    ], { duration: 550, easing: "ease-out" });
    timer = window.setTimeout(() => { feedback.textContent = ""; }, 2200);
  }
  function changeMotion() { reset(); animation?.cancel(); }
  zone.addEventListener("pointermove", follow);
  zone.addEventListener("pointerleave", reset);
  zone.addEventListener("pointercancel", reset);
  button.addEventListener("click", react);
  reduced.addEventListener("change", changeMotion);
  return () => {
    zone.removeEventListener("pointermove", follow);
    zone.removeEventListener("pointerleave", reset);
    zone.removeEventListener("pointercancel", reset);
    button.removeEventListener("click", react);
    reduced.removeEventListener("change", changeMotion);
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    animation?.cancel();
  };
}
