import React from "react";
import { Brain, Clock3, ExternalLink, ShieldCheck } from "lucide-react";
import { createDefaultDeckSettings } from "../../coreModel.ts";
import { EXAMPLE_CHAINS, runExampleChain } from "../../schedulerExampleChains.ts";
import { SoftPanel } from "../../ui/coreUi.tsx";

const SCHEDULING_STEPS = [
  {
    label: "Gedächtniszustand aktualisieren",
    text: "Nach deiner Bewertung werden Stabilität S und Schwierigkeit D neu geschätzt.",
  },
  {
    label: "Vergessen vorhersagen",
    text: "Zwischen Reviews bleiben S und D unverändert, während R mit der Zeit fällt.",
  },
  {
    label: "Nächsten Termin setzen",
    text: "FSRS wählt den Zeitpunkt, an dem R voraussichtlich die gewünschte Zielerinnerung erreicht.",
  },
] as const;

const RATING_GUIDE: ReadonlyArray<{ label: string; text: string }> = [
  { label: "Nochmal", text: "Nicht gewusst oder falsch. Die Karte kommt nach wenigen Minuten in derselben Sitzung zurück; in der Wiederholung bricht ihre Haltbarkeit ein." },
  { label: "Schwer", text: "Richtig, aber nur mit Mühe, nach Zögern oder lückenhaft. Der Abstand wächst deutlich langsamer. Im Zweifel ist das die ehrliche Wahl." },
  { label: "Gut", text: "Richtig mit normalem Nachdenken. Das ist die übliche Antwort." },
  { label: "Leicht", text: "Sofort und mühelos. Beendet die Lernphase und streckt den Abstand stark." },
];

const MEMORY_TERMS: ReadonlyArray<{ term: string; description: string }> = [
  { term: "R · Abrufwahrscheinlichkeit", description: "Wie wahrscheinlich du den Inhalt jetzt korrekt erinnern kannst." },
  { term: "S · Stabilität", description: "Wie lange die Erinnerung hält. CoRe zeigt sie als Haltbarkeit: Tage, bis R auf 90 Prozent fällt." },
  { term: "D · Schwierigkeit", description: "Wie schwer sich diese Erinnerung dauerhaft festigen lässt." },
  { term: "Zielerinnerung", description: "Die gewünschte Abrufwahrscheinlichkeit am nächsten Termin." },
  { term: "Intervall", description: "Der zeitliche Abstand bis zur nächsten Wiederholung." },
  { term: "Original und Variante", description: "Verschiedene Fragen zur gleichen Wissenseinheit." },
];

/** The example chain „Immer Gut“ at the default target retention. */
function defaultGoodChain() {
  const retention = createDefaultDeckSettings().schedulerProfile.desiredRetention;
  const contacts = runExampleChain(EXAMPLE_CHAINS[0].ratings, retention);
  return {
    retentionPercent: Math.round(retention * 100),
    minutes: contacts.flatMap((contact) => contact.intervalMinutes === null ? [] : [contact.intervalMinutes]),
    days: contacts.filter((contact) => contact.intervalMinutes === null).slice(0, 4).map((contact) => Math.round(contact.intervalDays)),
  };
}

export function RatingGuidePanel() {
  const chain = React.useMemo(defaultGoodChain, []);
  const days = `${chain.days.slice(0, -1).join(", ")} und ${chain.days.at(-1)} Tagen`;
  return (
    <section className="min-w-0" aria-labelledby="help-rating-heading" data-testid="help-rating-guide">
      <h3 id="help-rating-heading" className="core-heading-2 text-core-text">So bewertest du</h3>
      <p className="mt-4 max-w-2xl core-body leading-6 text-core-secondary">
        FSRS-7 traut einer sicheren Antwort große Abstände zu: Mit {chain.retentionPercent} % Zielerinnerung kommt eine neue Karte, immer mit „Gut“ bewertet, nach {chain.minutes.join(" und ")} Minuten und dann nach {days} wieder. Wähle „Gut“ deshalb nur, wenn der Abruf wirklich sicher war.
      </p>
      <dl className="mt-6 grid border-t border-core-border md:grid-cols-2 xl:grid-cols-4">
        {RATING_GUIDE.map((entry) => (
          <div key={entry.label} className="border-b border-core-border py-4 md:pr-6">
            <dt className="core-body font-semibold text-core-text">{entry.label}</dt>
            <dd className="mt-1 core-caption leading-5 text-core-secondary">{entry.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ReferenceList({ items, testId }: { items: readonly React.ReactNode[]; testId: string }) {
  return (
    <ul className="grid max-w-2xl list-disc gap-4 pl-5 core-body leading-7 text-core-secondary marker:text-core-muted" data-testid={testId}>
      {items.map((item, index) => <li key={index} className="pl-1">{item}</li>)}
    </ul>
  );
}

export function PlanningTopic() {
  return (
    <div className="grid min-w-0 gap-12">
      <div className="grid gap-4 lg:grid-cols-2">
        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <Clock3 size={20} aria-hidden="true" className="shrink-0 text-core-secondary" />
            <h3 className="core-heading-2 text-core-text">So arbeitet ein Spaced-Repetition-Scheduler</h3>
          </div>
          <ol className="mt-6 border-t border-core-border">
            {SCHEDULING_STEPS.map((step, index) => (
              <li key={step.label} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b border-core-border py-4">
                <span className="core-caption font-semibold leading-6 tabular-nums text-core-muted" aria-hidden="true">0{index + 1}</span>
                <div>
                  <p className="core-body font-semibold text-core-text">{step.label}</p>
                  <p className="mt-1 core-caption leading-5 text-core-secondary">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </SoftPanel>

        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck size={20} aria-hidden="true" className="shrink-0 text-core-secondary" />
            <h3 className="core-heading-2 text-core-text">Transparenz zum aktuellen Scheduler</h3>
          </div>
          <p className="mt-6 core-body leading-6 text-core-secondary">
            CoRe verwendet FSRS-7 mit den offiziellen Standardparametern. Es berücksichtigt alle Reviews einschließlich mehrerer Abrufe am selben Tag. Die persönliche Optimierung der Parameter aus deiner eigenen Reviewhistorie ist noch nicht aktiviert.
          </p>
          <p className="mt-3 core-body leading-6 text-core-secondary">
            Neue Karten durchlaufen zuerst kurze Lernschritte, nach einem Fehler einen Wiederlernschritt; beide kommen in derselben Sitzung zurück. Eine höhere Zielerinnerung bedeutet kürzere Intervalle und mehr Reviews pro Tag.
          </p>
        </SoftPanel>
      </div>

      <section className="min-w-0" aria-labelledby="help-terms-heading">
        <h3 id="help-terms-heading" className="core-heading-2 text-core-text">Begriffe</h3>
        <dl className="mt-4 grid border-t border-core-border md:grid-cols-2 xl:grid-cols-3">
          {MEMORY_TERMS.map((memoryTerm) => (
            <div key={memoryTerm.term} className="border-b border-core-border py-6 md:pr-8">
              <dt className="core-body-large font-semibold text-core-text">{memoryTerm.term}</dt>
              <dd className="mt-2 core-body leading-6 text-core-secondary">{memoryTerm.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="max-w-2xl" aria-labelledby="help-fsrs-heading">
        <div className="flex items-center gap-3">
          <Brain size={20} aria-hidden="true" className="shrink-0 text-core-secondary" />
          <h3 id="help-fsrs-heading" className="core-heading-2 text-core-text">Mehr über FSRS</h3>
        </div>
        <p className="mt-4 core-body leading-6 text-core-secondary">Die offizielle Einführung erklärt das vollständige FSRS-Modell, seine Modellparameter und die Zielerinnerung.</p>
        <a className="core-action-secondary mt-6 w-fit" href="https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS" target="_blank" rel="noreferrer noopener">
          ABC of FSRS öffnen
          <ExternalLink size={17} aria-hidden="true" />
        </a>
      </section>
    </div>
  );
}

export function VariantsTopic() {
  return (
    <ReferenceList testId="help-variants" items={[
      "Die Variante prüft dieselbe Wissenseinheit und führt keine neuen Fakten ein.",
      "Genau eine Originalkarte bleibt als Vertrauensanker erhalten.",
      "Varianten erscheinen nur in der Wiederholungsphase und erst ab der Haltbarkeit des Stapels: so vielen Tagen, bis die Erinnerung voraussichtlich auf 90 % fällt. Richtige Antworten verlängern die Haltbarkeit, Fehler verkürzen sie.",
      "Frühestens drei Tage nach der letzten Antwort kommen nur noch Varianten, eine nach der anderen: Eine richtige Antwort führt zur nächsten, „Schwer“ wiederholt sie. Nach einem Fehler fragt CoRe die Originalkarte ab, bis die Haltbarkeit wieder reicht; dann geht es eine Variante zurück weiter.",
      "Der Variantenpunkt im Diagramm ist keine garantierte Produktionsschwelle und keine garantierte Reviewnummer.",
    ]} />
  );
}

export function ExamSessionTopic() {
  return (
    <ReferenceList testId="help-exam-session" items={[
      "„Heutige Einheit lernen“ enthält die geplanten neuen Karten deiner Prüfungsthemen, ihre Lernschritte und die heute fälligen Wiederholungen dieser Stapel. Eine einzelne Lernaufgabe startet nur ihr Thema.",
      "Themen kommen in der geplanten Reihenfolge. Es gilt das Abrufziel der Prüfung; normale Tageslimits greifen nicht, und deine Stapeleinstellungen bleiben unverändert.",
      "Eine Lernaufgabe wird automatisch abgehakt, sobald alle ihre Karten bewertet und erst nach heute wieder fällig sind. Selbst abhaken ändert keinen Lernstand.",
      "Die Zielkarten eines Tages bleiben fest. Nach deinen Antworten verteilt CoRe nur noch ungesehenen Stoff neu. Ohne Verbindung startet die Einheit mit den Karten auf diesem Gerät; neu geplant wird erst wieder online.",
    ]} />
  );
}

export function CardManagementTopic() {
  return (
    <ReferenceList testId="help-card-management" items={[
      <>Die Suche versteht Anki-Begriffe wie <code>tag:</code>, <code>is:due</code> oder <code>Feld:Text</code>. „Erweiterte Suche“ setzt sie per Klick und speichert Suchen.</>,
      "Ausgewählte Karten änderst du gemeinsam: Stapel, Tags, Flagge, Markierung, Aussetzen, Fälligkeit oder Löschen. Jede Aktion fragt nach und lässt sich rückgängig machen.",
      "Zur Pflege gibt es „Suchen und Ersetzen“, „Duplikate finden“ und „Tags verwalten“ für das ganze Konto.",
      "„Treffer lernen“ lernt die Treffer einer Suche: „Vorziehen“ zählt wie eine Sitzung ohne Tageslimit, „Nur üben“ ändert keinen Lernstand.",
      "„Alle Karten frei üben“ im Menü eines Stapels übt alle seine Karten samt Unterstapeln, ohne den Lernstand zu ändern.",
      <>Tasten: <kbd>/</kbd> sucht, <kbd>↑</kbd> <kbd>↓</kbd> wechseln die Zeile, <kbd>X</kbd> wählt aus, Ziffern setzen die Flagge, <kbd>Strg</kbd>+<kbd>Z</kbd> nimmt die letzte Aktion zurück. Das Menü „Aktionen“ nennt alle Tasten.</>,
    ]} />
  );
}
