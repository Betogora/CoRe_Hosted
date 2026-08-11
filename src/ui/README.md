# CoRe UI-Katalog

Stand: 2026-08-06

Dieser Katalog ist die code-nahe Übersicht der verfügbaren UI-Bausteine. Neue Features prüfen diese Elemente vor einer eigenen Implementierung. Wiederverwendung ist empfohlen, aber nicht verpflichtend, wenn die vorhandene Schnittstelle die Fachsemantik verschlechtern würde. Ein neues gemeinsames Modul wird erst aus mindestens drei gleichartigen aktuellen Stellen oder aus zentralisierungswürdigem Accessibility-Verhalten gewonnen.

## Theme und Typografie

`src/styles.css` besitzt die primitiven CoRe-Farben, alle semantischen Light-/Dark-Rollen und die Typostufen. Produktcode verwendet semantische Klassen beziehungsweise Variablen. Der Theme-Schalter in der Sidebar setzt ausschließlich `data-core-theme="light"` beziehungsweise `data-core-theme="dark"` am Dokumentelement; `src/coreTheme.ts` besitzt Validierung und lokale Persistenz der Auswahl. Eine automatische Systempräferenz gibt es bewusst nicht.

Die teilbare visuelle Referenz liegt in `docs/ui-elements.html`. Nach Änderungen an Theme, Typografie, gemeinsamen Komponenten oder eigenständigen fachlichen UI-Mustern werden die betroffenen Beispiele manuell gegen die Produktoberflächen geprüft; `npm run docs:ui-elements` synchronisiert anschließend die eingebetteten Styles und den Quellenstand. `npm run typecheck` führt `npm run docs:ui-elements:check` aus und schlägt fehl, wenn dieser technische Stand abweicht. Der Check ersetzt nicht die fachliche Sichtprüfung der kuratierten Beispiele.

- Überschriften: `core-heading-1`, `core-heading-2`, `core-heading-3`.
- Fließtext: `core-body-large`, `core-body`, `core-caption`.
- Labels: `core-control-label`, `core-status-label`, `core-emphasis`.
- DOM-Fokus und Tastaturführung bleiben global erhalten, sichtbare Fokusrahmen und Fokus-Rings werden jedoch appweit unterdrückt. Disabled, Placeholder und fachliche Auswahl werden weiterhin aus Theme-Tokens abgeleitet.

## Actions

Direktimport: `import { ActionButton, IconButton } from "../ui/actionUi.tsx"`.

`ActionButton` verlangt `variant="primary | secondary | destructive"`; optional sind `icon` und `loading`. Das Modul besitzt die produktweite Standardhöhe von 44 px, Iconabstand, Hover/Active/Focus/Disabled sowie den Ladezustand mit erhaltenem Label und `aria-busy`. Der Aufrufer wählt Hierarchie, Label und Ereignis. Für nachgeordnete Aktionen wird die umrandete Sekundärform verwendet; eine randlose Textbutton-Variante gibt es nicht.

```tsx
<ActionButton variant="primary" icon={Save} loading={saving} onClick={save}>
  Speichern
</ActionButton>
```

Nicht für Reviewratings, MCQ-Antworten, Tabs, Farbfelder, Navigationszeilen oder segmentierte Controls verwenden, deren Auswahlsemantik über einen normalen Action-Button hinausgeht.

`IconButton` verlangt `label` und `icon`; Varianten sind `secondary` (Standard), `destructive` und `ghost`. `ghost` bleibt transparent und randlos, sodass fachliche Zeilenflächen sichtbar bleiben. Das Modul setzt das zugängliche Label, die feste Größe von 44 × 44 px und die Icongröße. Für einen zusätzlichen sichtbaren Hinweis wird `CoreTooltip` verwendet; native `title`-Tooltips gehören nicht zur Produkt-UI.

```tsx
<IconButton label="Antwortoption entfernen" icon={X} onClick={removeOption} />
```

Spezialisierte native Buttons dürfen direkt `core-action-primary`, `core-action-secondary` oder `core-action-destructive` nutzen, wenn eine React-Abstraktion ihr Interface verschlechtern würde.

## Tooltips

Direktimport: `import { CoreTooltip } from "../ui/tooltipUi.tsx"`. `CoreTooltipProvider` wird einmal an der App-Wurzel eingebunden.

`CoreTooltip` verlangt einen kurzen deutschen `label` und genau ein bestehendes React-Element. Es ergänzt kein Layout-Element, bewahrt vorhandene Ereignisse und zugängliche Beschreibungen und zeigt den Hinweis nach kurzem Maus-Hover beziehungsweise sofort bei Tastaturfokus. Positionierung, Viewport-Grenzen, Escape, Hover-Persistenz und Touch-Ausschluss gehören dem gemeinsamen Modul. Für einen Tooltip zu genau einem Stapel liefert `deckAppearance` dessen normalisierte Darstellung; der Provider setzt daraus ein 16 × 16-px-Icon in die bestehende Einzeilerhöhe. Der zugängliche Name des Triggers bleibt davon unabhängig und darf zur Unterscheidung gleichnamiger Stapel den vollständigen Pfad enthalten.

```tsx
<CoreTooltip label="Frühere Wochen anzeigen">
  <button type="button" aria-label="Frühere Wochen anzeigen">…</button>
</CoreTooltip>
```

Tooltips bleiben rein informativ und enthalten weder Aktionen noch frei formatierte Inhalte. Strukturelle Komponenten-Props namens `title` sind davon nicht betroffen.

## Oberflächen und Struktur

Direktimport aus `src/ui/coreUi.tsx`:

- `SoftPanel`: kanonische erhöhte Inhaltsfläche; Aufrufer besitzt Innenlayout und Heading-Semantik.
- `PageHeader`: optionale Screen-Eyebrow und sichtbare Heading-1-Stufe; keine dritte Textzeile oder dekorative Aktion ergänzen.
- `EmptyState`: Icon, Titel, optionaler Text und optionaler Action-Slot.
- `ActionDialog`: modaler Bestätigungsdialog mit Fokusfalle, Escape, Außenklick als Cancel, Cancel/Confirm, optionaler Verwerfen-Aktion, optionalen Aktionsicons, Ladezustand und Fokuswiederherstellung; ohne Beschreibung erscheint er kompakt in einer Zeile, explizit destruktive Bestätigungen behalten ihre Gefahrenform; intern gemeinsame Actions.
- `OrbIcon`: rein dekorativer Icon-Kreis; Bedeutung bleibt im umgebenden Text.
- `CoreSegmentedControl`: iconfreie gemeinsame Auswahlgruppe mit einzeln gerundeten Bricks, neutraler aktiver Fläche und `aria-pressed`; `regular` besitzt 44 px Höhe, `compact` 36 px. Aktuelle Verbraucher sind Statistikzeitraum, Heatmap-Zeitraum und CoRe-Modus.
- `CoreModeControl`: fachliches Drei-Wege-Control für Aus/Auto/Manuell auf Basis des regulären `CoreSegmentedControl`, kein allgemeiner Tab-Ersatz.
- `CoreSwitch`: kontrollierte gemeinsame Switch-Basis mit `checked`, `disabled`, `ariaLabel` und `onCheckedChange`; Aufrufer besitzen den fachlichen Zustand.
- `CardMarkButton`: kontrollierter zugänglicher Stern-Button mit `aria-pressed`, leerem Normalzustand und gelb gefülltem Markierungszustand.

CSS-Oberflächen: `core-surface`, `core-surface-raised`, `core-surface-muted`, `core-overlay`.

## Feedback und Status

Direktimport: `import { StatusMessage, SuccessToast, SuccessToastProvider, useSuccessToast } from "../ui/feedbackUi.tsx"`.

`StatusMessage` verlangt `tone="info | success | warning | error"`. `announce="polite"` erzeugt eine Status-Live-Region, `announce="assertive"` einen Alert und der Standard `false` keine Live-Region. Farbe, Rand und Standardicon liegen im Modul; der Aufrufer entscheidet, ob eine Zustandsänderung angekündigt werden muss.

```tsx
<StatusMessage tone="success" announce="polite">
  Import abgeschlossen.
</StatusMessage>
```

Für spezialisierte Strukturen stehen `core-status-info`, `core-status-success`, `core-status-warning` und `core-status-error` bereit.

`SuccessToast` zeigt eine kurze, abgeschlossene Erfolgsmeldung als schließbares Overlay oben rechts. Die Breite folgt dem Inhalt bis zur Viewport-Grenze; der feste Schließen-Slot bleibt rechts erhalten und Haken, Text sowie Schließen-Aktion sind vertikal ausgerichtet. `SuccessToastProvider` besitzt produktweit den einzigen Toast-State und Portal-Host; `useSuccessToast` ersetzt die aktuelle Meldung, ohne den auslösenden Screen für die Darstellung erneut zu rendern. Kontextabhängige Ergebnisse, Ladehinweise, Warnungen und Fehler bleiben als `StatusMessage` beziehungsweise fachliche Struktur inline.

```tsx
const setSuccessToast = useSuccessToast();
setSuccessToast("Import erfolgreich abgeschlossen.");
```

## Formular-Primitives

`core-field`, `core-field-label`, `core-field-hint`, `core-field-error` und `core-field-group` vereinheitlichen Feld, Label, Hinweis, Fehler, Fokus, Invalid und Disabled. Inputs und Textareas behalten ihre native beziehungsweise fachliche React-Struktur; es gibt bewusst keinen generischen Formularwrapper.

Auswahlfelder verwenden `CoreSelect` aus `src/ui/selectUi.tsx`. Die Komponente verlangt einen kontrollierten Stringwert, eine Liste aus `{ value, label }`, `onValueChange` und ein zugängliches `ariaLabel`. Sie besitzt den symmetrisch gepolsterten Trigger, das CoRe-Overlay, Auswahlmarkierung, Viewport-Kollisionen, Scrollen, Tastaturnavigation, Typeahead und Fokuswiederherstellung. Leere fachliche Werte bleiben nach außen unverändert; ihre technische Codierung ist privat.

Stapelbezogene Auswahl verwendet `DeckSelect` für genau einen Stapel und `DeckMultiSelect` ausschließlich für den Statistik-Scope. Beide Varianten teilen Overlay, Typografie, 44-px-Zeilen, alphabetisch je Hierarchieebene sortierte Baumprojektion, Hierarchieeinrückung und eine höchstens 320 px hohe Liste mit nativer Seiten-Scrollbar; ohne tatsächlichen Überlauf nutzen die Zeilen die vollständige Listenbreite. Ab fünf tatsächlich auswählbaren Stapeln erscheint eine Suche über den vollständigen Hierarchiepfad; Sonderziele wie Hauptstapel, Hauptebene oder gesamte Sammlung zählen nicht zur Schwelle und bleiben von der Suche getrennt. `DeckSelect` zeigt im geschlossenen Zustand Stapel-Icon und vollständigen Pfad und markiert die einzelne Auswahl mit einer Auswahlfläche und einem Haken rechts. `DeckMultiSelect` verwendet dieselbe Markierung für mehrere Zeilen; durch einen gewählten Oberstapel eingeschlossene Unterstapel bleiben markiert und deaktiviert, jedoch einzeilig. In der Statistik stehen Suche, gesamte Sammlung und Stapelbaum jeweils durch Trennlinien gegliedert untereinander. Tiefen steuern ausschließlich die Einrückung und niemals eine Gruppenfarbe.

## Fortschritt und Datenvisualisierung

`SegmentedDonut` und `StatTile` aus `src/ui/coreUi.tsx` decken segmentierte Ringverteilungen und Kennzahlflächen ab. `SegmentedDonut` erhält geordnete, nichtnegative Segmente, eine vollständige zugängliche Beschriftung sowie Standard-, Kompakt- oder intern responsive Größe. Er zeichnet exakte SVG-Anteile mit semantischem Innen-, Außen- und Segmentrand; das Zentrum bleibt transparent und übernimmt dadurch die umgebende Oberfläche. Fachliche Segmentreihenfolge, Farben und Bedeutung bleiben beim Aufrufer, Unterschiede dürfen nie nur über Farbe vermittelt werden.

## Spezialisierte Feature-Module

- `StudyHeatmap` aus `src/ui/StudyHeatmap.tsx`: gemeinsame responsive Lern-Heatmap für Dashboard und Statistik mit dynamischem Streak-Titel, lokaler Segmentauswahl für die letzten sieben Tage, den Kalendermonat oder das Kalenderjahr, beidseitiger Zeitraum-Navigation, historischer Lila-Intensitätslegende und CoRe-Tooltips. Die Komponente visualisiert zusätzlich morgen bis Tag +365 aus dem normalisierten Modell gelieferte eindeutige nächste Kartenfälligkeiten auf einer getrennten semantischen Grauskala; spätere Resttage vollständiger Kalenderfenster bleiben abgeblendet. Eine native Container-Query hält den Kopf ab 34 rem Heatmapbreite einzeilig und darunter stabil zweizeilig. Woche und Monat passen sich ohne Seitenüberlauf an; das vollständige Jahresraster besitzt auf schmalen Ansichten einen eigenen horizontalen Scrollbereich. Die Aufrufer liefern das dünne allzeitliche Heatmap-Modell sowie nur ihre fachliche Beschriftung historischer Tage; die gemeinsame Prognosebeschriftung besitzt das UI-Modul.
- `DeckSummaryRow` aus `src/ui/DeckSummaryRow.tsx`: kanonischer einzeiliger Zeilenrenderer für Dashboard, Lernen und Kartenverwaltung mit Chevron-Slot, Stapel-Icon, Name ohne sichtbaren Hierarchiepfad, den disjunkten Tageskennzahlen `Neu`, `In Arbeit` und `Fällig`, segmentiertem Gesamtbestandsdonut und Aktionsslot. Der Donut ordnet den aktiven Bestand als Neu, In Arbeit, Fällig und Gelernt in Lilac, Coral, Slate und Marigold und nennt alle Werte zugänglich. `metricLabels="sr-only"` hält die Kennzahlbedeutungen ausschließlich für assistive Technik erreichbar; der responsive Standard zeigt sie ab 44 rem verfügbarer Zeilenbreite. `DeckSummaryHeader` verwendet dieselben Kennzahlspalten für den einmaligen, 28 px hohen Kopf von Dashboard und Lernen und kürzt sie nur unter 18 rem verfügbarer Zeilenbreite visuell zu `N`, `IA` und `F`. Die Kartenverwaltung liefert direkte Werte und behält die responsiven Zeilenlabels, Dashboard und Lernen aggregieren Unterstapel; alle drei Ansichten verwenden dasselbe reduzierte Stapelmenü.
- `CompactDeckSummaryRow` aus `src/ui/CompactDeckSummaryRow.tsx`: feste kompakte UI-Elements-Projektion desselben Renderers ohne sichtbaren Herkunftspfad und ohne sichtbare Kennzahllabel. Name, drei zugänglich benannte Zahlen, kompakter Donut und Aktionen bleiben in einer Zeile; Tiefenfarbe und Collapse-Verhalten besitzt weiterhin der Aufrufer.
- `DeckTree` aus `src/ui/DeckTree.tsx`: gemeinsames Panel `Aktive Stapel` und flache, kontrolliert einklappbare, je Hierarchieebene alphabetisch sortierte Projektion des Stapelbaums für Dashboard und Lernen mit aggregierten Teilbaum-Kennzahlen. Ein nicht sortierbarer Kopf zeigt `Stapel`, `Neu`, `In Arbeit` und `Fällig` genau einmal; die Zeilen zeigen nur die farbigen Zahlen. Die Aufrufer liefern den kontogebunden gespeicherten Zustand der jeweiligen Ansicht. Native Container-Queries halten Titel und optionale Aktion einzeilig, setzen sie nur unter 17 rem Panelbreite untereinander und platzieren die Drag-Zielzone unter 44 rem als vollständige zweite Zeile. Der per Pointer-Capture gebundene Desktop-Drag bleibt beim Verlassen der Zeilenfläche aktiv und erreicht die Hauptebenen-Zone im Panelkopf; ein angehobener Quellzustand und verstärkte Zielmarkierung machen die Geste sichtbar. Gruppentiefen 0 bis 3 entsprechen Hauptstapel, Unterstapel, Unter-Unterstapel und Unter-Unter-Unterstapel; tiefere importierte Bäume verwenden den zusätzlichen Ton von Tiefe 4.
- `AppNavigation` aus `src/ui/AppNavigation.tsx`: einzige responsive App-Navigation. Unter 1280 px besitzt sie den kompakten CoRe-Kopf, optionalen Pomodoro-Fortschritt, die gemeinsame Utility-Gruppe und die schwebende Fünf-Tab-Bottom-Bar; ab 1280 px die Sidebar mit demselben Fortschritt und der links an den Navigations-Icons ausgerichteten Utility-Gruppe ohne Trennlinie. Die Gruppe verwendet gemeinsame `IconButton`-Primitives für das umrundete Einstellungszahnrad und den randlosen Sonnen-/Mond-Button; im kompakten Kopf steht das Einstellungszahnrad ganz rechts. `AppNavigation` hält den browserlokalen Theme-Zustand einmal für beide Projektionen; eine Profilvorschau und eine parallele Theme-Zeile in den Einstellungen existieren nicht. `Karten` verwendet in beiden Projektionen dasselbe Stapel-Icon, während Einstellungen, Hilfe und Simulator den aktiven Einstellungszustand teilen.
- `StudySettingsOverlay` aus `src/ui/StudySettingsOverlay.tsx`: gemeinsame modale Lerneinstellungen mit den ohne Inhaltslinien durch Abstand gegliederten Abschnitten `Karte` und `Sitzung`. Dasselbe DOM erscheint unter 768 px als Bottom Sheet und ab 768 px als zentrierter Dialog; das Modul besitzt Portal, Fokusfalle, Escape-/Außenklick-Schließen, Fokuswiederherstellung, Viewportscroll und Reduced Motion. Es komponiert `CardMarkButton`, `CoreSwitch` und den kontrollierten `PomodoroTimerControl`; Karten- und Stapelbearbeitung, Timerstart sowie Statusmutation bleiben Callbacks des Aufrufers. Stapelgrenzwerte werden ausschließlich im `DeckSettingsScreen` bearbeitet.
- `PomodoroTimerControl` und `PomodoroProgress` aus `src/ui/pomodoroTimerUi.tsx`: gemeinsame ausklappbare Ganzzahl-/Startprojektion für globale Einstellungen und Sitzungs-Overlay sowie schlanke Fortschrittsprojektion für Review, Sidebar und mobilen Kopf. Beide lesen nur den kontrollierten Laufdatensatz; Zeitfortschritt wird lokal aus der realen Endzeit abgeleitet, Timerbesitz und Persistenz bleiben außerhalb des UI-Moduls.
- `DeckOptionsMenu` aus `src/ui/DeckOptionsMenu.tsx`: identisches randloses Drei-Punkte-Menü für Dashboard, Lernen und Kartenverwaltung mit Deck-Icon, lokalem Stapelnamen, CoRe-Modus, Einstellungen und gemeinsamem bestätigten Verschiebedialog. Tooltip und Menükopf zeigen nur den lokalen Namen; ausschließlich der zugängliche Triggername behält den vollständigen Pfad. Weitere Stapelaktionen gehören in die Stapel-Einstellungen.
- `RichTextEditor` aus `src/ui/RichTextEditor.tsx`: sanitisiertes Karten-HTML, Toolbar, Text- und Markerfarben.
- `ColorWheelPicker` aus `src/ui/ColorWheelPicker.tsx`: kompakter runder Farbkreis für kontrollierte Farbfelder.
- `ColorPopover` und `ColorToolButton` aus `src/ui/colorPicker.tsx`: gespeicherte Rich-Text-Farbfelder und technisches Farbspektrum.
- `PdfDocumentViewer` aus `src/ui/PdfDocumentViewer.tsx`: PDF-Rendering, Zoom, Navigation und Textauswahl.
- `LearningSettingsPanel` aus `src/ui/LearningSettingsPanel.tsx`: gemeinsame kompakte Projektion fachlicher Lernparameter und Presets. Selbsterklärende Felder bleiben ohne wiederholenden Hinweis; Folgen, Abwägungen und Warnungen bleiben sichtbar. Tagespensum und Content-Repetition-Felder wechseln responsiv zwischen drei, zwei und einer Spalte. Der Schalter für kurze Abstände verwendet `CoreSwitch`. Stapelspezifische Aufrufer können zusätzlich `variantThresholdXp` und `maxActiveVariantsPerCard` übergeben; globale Aufrufer lassen beide weg, und Preset-Wechsel erhalten vorhandene Werte.
- `DeckAppearanceIcon` aus `src/ui/deckAppearance.tsx`: normalisierte, nutzerdefinierte Stapeldarstellung.
- `CardHtml` aus `src/ui/cardMedia.tsx`: sanitisiertes Karten-HTML mit aufgelösten Medien.
- `ReleaseInfo` aus `src/ui/ReleaseInfo.tsx`: sichtbare Build-/Release-Information.

Diese Module nicht zu generischen Primitives verbreitern; ihre Fachverantwortung bleibt Bestandteil der Schnittstelle.

## Entscheidungshilfe für neue UI

1. Ist es eine normale Aktion, Icon-Aktion, Oberfläche, Statusmeldung oder ein vorhandenes Spezialmodul? Dann zuerst den passenden Eintrag oben prüfen.
2. Passt dessen Semantik und Accessibility-Verhalten vollständig? Dann direkt importieren.
3. Benötigen mindestens drei aktuelle Stellen dieselbe neue Struktur oder wird wichtiges zugängliches Verhalten zentralisiert? Dann eine kleine gemeinsame Seam erwägen.
4. Andernfalls lokal und semantisch mit den zentralen Theme-/Typografie-Tokens implementieren; keine parallele Palette oder Button-Grundlogik anlegen.
