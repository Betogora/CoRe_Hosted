import React from "react";
import { getDailyMotivation } from "../dailyMotivation.ts";
import { getNextLearningDayBoundaryDelay } from "../learningDay.ts";
import { BrainMascot } from "../ui/BrainMascot.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";

export function DailyMotivationWidget({ now, timeZone, dayStartHour }: { now: string; timeZone: string; dayStartHour: number }) {
  // Advance the supplied (possibly simulated) clock without replacing it with wall time.
  const [clock, setClock] = React.useState(now);
  React.useEffect(() => {
    const started = Date.now();
    const supplied = Date.parse(now);
    let timer = 0;
    function update() {
      window.clearTimeout(timer);
      const current = new Date(supplied + Date.now() - started).toISOString();
      setClock(current);
      const delay = getNextLearningDayBoundaryDelay(current, { timeZone, dayStartHour });
      if (delay !== null) timer = window.setTimeout(update, delay + 25);
    }
    function visible() { if (document.visibilityState === "visible") update(); }
    update();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", update);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", update); };
  }, [now, timeZone, dayStartHour]);
  const motivation = getDailyMotivation(clock, { timeZone, dayStartHour });
  return <SoftPanel className="motivation-widget p-6" data-brain-zone="" data-motivation-day={motivation.day}>
    <h2 className="core-heading-3 font-semibold text-core-text">Dein Motivationsimpuls</h2>
    <div className="motivation-widget-layout">
      <div><p className="core-caption text-core-muted">Ein Gedanke für deinen Lerntag</p><p className="motivation-widget-quote core-body-large font-medium text-core-text">{motivation.text}</p></div>
      <BrainMascot id={motivation.mascotId} interactive />
    </div>
  </SoftPanel>;
}
