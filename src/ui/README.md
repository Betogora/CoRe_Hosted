# CoRe UI-Katalog

Stand: 2026-08-03

Dieser Katalog ist die code-nahe Übersicht der verfügbaren UI-Bausteine. Neue Features prüfen diese Elemente vor einer eigenen Implementierung. Wiederverwendung ist empfohlen, aber nicht verpflichtend, wenn die vorhandene Schnittstelle die Fachsemantik verschlechtern würde. Ein neues gemeinsames Modul wird erst aus mindestens drei gleichartigen aktuellen Stellen oder aus zentralisierungswürdigem Accessibility-Verhalten gewonnen.

## Theme und Typografie

`src/styles.css` besitzt die primitiven CoRe-Farben, alle semantischen Light-/Dark-Rollen und die Typostufen. Produktcode verwendet semantische Klassen beziehungsweise Variablen. Der Theme-Schalter in der Sidebar setzt ausschließlich `data-core-theme="light"` beziehungsweise `data-core-theme="dark"` am Dokumentelement; `src/coreTheme.ts` besitzt Validierung und lokale Persistenz der Auswahl. Eine automatische Systempräferenz gibt es bewusst nicht.

Die teilbare visuelle Referenz liegt in `docs/ui-elements.html`. Nach Änderungen an Theme, Typografie, gemeinsamen Komponenten oder eigenständigen fachlichen UI-Mustern wird sie mit `npm run docs:ui-elements` neu erzeugt. `npm run typecheck` führt `npm run docs:ui-elements:check` aus und schlägt fehl, wenn die eingebetteten Styles nicht mehr den kanonischen Quellen entsprechen.

- Überschriften: `core-heading-1`, `core-heading-2`, `core-heading-3`.
- Fließtext: `core-body-large`, `core-body`, `core-caption`.
- Labels: `core-control-label`, `core-status-label`, `core-emphasis`.
- Fokus, Disabled, Placeholder und Auswahl werden global aus Theme-Tokens abgeleitet.

## Actions

Direktimport: `import { ActionButton, IconButton } from "../ui/actionUi.tsx"`.

`ActionButton` verlangt `variant="primary | secondary | tertiary | destructive"`; optional sind `icon` und `loading`. Das Modul besitzt die produktweite Standardhöhe von 44 px, Iconabstand, Hover/Active/Focus/Disabled sowie den Ladezustand mit erhaltenem Label und `aria-busy`. Der Aufrufer wählt Hierarchie, Label und Ereignis.

```tsx
<ActionButton variant="primary" icon={Save} loading={saving} onClick={save}>
  Speichern
</ActionButton>
```

Nicht für Reviewratings, MCQ-Antworten, Tabs, Farbfelder, Navigationszeilen oder segmentierte Controls verwenden, deren Auswahlsemantik über einen normalen Action-Button hinausgeht.

`IconButton` verlangt `label` und `icon`; Varianten sind `secondary`, `tertiary` (Standard) und `destructive`. Das Modul setzt das zugängliche Label, die feste Größe von 44 × 44 px und die Icongröße. Für einen zusätzlichen sichtbaren Hinweis wird `CoreTooltip` verwendet; native `title`-Tooltips gehören nicht zur Produkt-UI.

```tsx
<IconButton label="Antwortoption entfernen" icon={X} onClick={removeOption} />
```

Spezialisierte native Buttons dürfen direkt `core-action-primary`, `core-action-secondary`, `core-action-tertiary`, `core-action-destructive` oder `core-icon-action` nutzen, wenn eine React-Abstraktion ihr Interface verschlechtern würde.

## Tooltips

Direktimport: `import { CoreTooltip } from "../ui/tooltipUi.tsx"`. `CoreTooltipProvider` wird einmal an der App-Wurzel eingebunden.

`CoreTooltip` verlangt einen kurzen deutschen `label` und genau ein bestehendes React-Element. Es ergänzt kein Layout-Element, bewahrt vorhandene Ereignisse und zugängliche Beschreibungen und zeigt den Hinweis nach kurzem Maus-Hover beziehungsweise sofort bei Tastaturfokus. Positionierung, Viewport-Grenzen, Escape, Hover-Persistenz und Touch-Ausschluss gehören dem gemeinsamen Modul.

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
- `ActionDialog`: modaler Bestätigungsdialog mit Fokusfalle, Escape, Cancel/Confirm, optionaler Verwerfen-Aktion, Ladezustand und Fokuswiederherstellung; intern gemeinsame Actions.
- `OrbIcon`: rein dekorativer Icon-Kreis; Bedeutung bleibt im umgebenden Text.
- `CoreModeControl`: fachliches Drei-Wege-Control für Aus/Auto/Manuell, kein allgemeiner Tab-Ersatz.
- `ThemeToggle`: zugänglicher Light-/Dark-Schalter für die App-Shell; das Modul besitzt seinen lokalen Darstellungszustand und die Switch-Semantik, `src/coreTheme.ts` Dokumentattribut und Persistenz.

CSS-Oberflächen: `core-surface`, `core-surface-raised`, `core-surface-muted`, `core-overlay`.

## Feedback und Status

Direktimport: `import { StatusMessage } from "../ui/feedbackUi.tsx"`.

`StatusMessage` verlangt `tone="info | success | warning | error"`. `announce="polite"` erzeugt eine Status-Live-Region, `announce="assertive"` einen Alert und der Standard `false` keine Live-Region. Farbe, Rand und Standardicon liegen im Modul; der Aufrufer entscheidet, ob eine Zustandsänderung angekündigt werden muss.

```tsx
<StatusMessage tone="success" announce="polite">
  Import abgeschlossen.
</StatusMessage>
```

Für spezialisierte Strukturen stehen `core-status-info`, `core-status-success`, `core-status-warning` und `core-status-error` bereit.

## Formular-Primitives

`core-field`, `core-field-label`, `core-field-hint`, `core-field-error` und `core-field-group` vereinheitlichen Feld, Label, Hinweis, Fehler, Fokus, Invalid und Disabled. Inputs und Textareas behalten ihre native beziehungsweise fachliche React-Struktur; es gibt bewusst keinen generischen Formularwrapper.

Auswahlfelder verwenden `CoreSelect` aus `src/ui/selectUi.tsx`. Die Komponente verlangt einen kontrollierten Stringwert, eine Liste aus `{ value, label }`, `onValueChange` und ein zugängliches `ariaLabel`. Sie besitzt den symmetrisch gepolsterten Trigger, das CoRe-Overlay, Auswahlmarkierung, Viewport-Kollisionen, Scrollen, Tastaturnavigation, Typeahead und Fokuswiederherstellung. Leere fachliche Werte bleiben nach außen unverändert; ihre technische Codierung ist privat.

## Fortschritt und Datenvisualisierung

`MiniProgress`, `DonutValue` und `StatTile` aus `src/ui/coreUi.tsx` decken kompakten Fortschritt, Prozentdonut und Kennzahlfläche ab. Aufrufer liefern Werte und verständliche Labels; Unterschiede dürfen nie nur über Farbe vermittelt werden.

## Spezialisierte Feature-Module

- `DeckTree` aus `src/ui/DeckTree.tsx`: kanonische einklappbare Stapelkarte für Dashboard und Lernen; besitzt dieselbe Folge aus linkem Icon, Name und Pfad, Teilbaum-Kennzahlen, Donut und rechten Stapeloptionen. Die Kartenverwaltung verwendet dieselben spezialisierten Erscheinungs- und Donut-Bausteine in unabhängigen Tabellenköpfen mit direkten Kennzahlen. Die nicht selektierbare neutrale Fläche des Baums verarbeitet Desktop-Drag stabil über Pointer-Ereignisse, während der darüber abgebildete semantische Button Tastatur und Screenreader bedient. Gruppentiefen 0 bis 3 entsprechen Hauptstapel, Unterstapel, Unter-Unterstapel und Unter-Unter-Unterstapel; tiefere importierte Bäume verwenden weiterhin den Ton von Tiefe 3. Fachliche Mutationen bleiben in den übergebenen Callbacks.
- `RichTextEditor` aus `src/ui/RichTextEditor.tsx`: sanitisiertes Karten-HTML, Toolbar, Text- und Markerfarben.
- `ColorWheelPicker` aus `src/ui/ColorWheelPicker.tsx`: kompakter runder Farbkreis für kontrollierte Farbfelder.
- `ColorPopover` und `ColorToolButton` aus `src/ui/colorPicker.tsx`: gespeicherte Rich-Text-Farbfelder und technisches Farbspektrum.
- `PdfDocumentViewer` aus `src/ui/PdfDocumentViewer.tsx`: PDF-Rendering, Zoom, Navigation und Textauswahl.
- `LearningSettingsPanel` aus `src/ui/LearningSettingsPanel.tsx`: fachliche Lernparameter und Presets.
- `DeckAppearanceIcon` aus `src/ui/deckAppearance.tsx`: normalisierte, nutzerdefinierte Stapeldarstellung.
- `CardHtml` aus `src/ui/cardMedia.tsx`: sanitisiertes Karten-HTML mit aufgelösten Medien.
- `ReleaseInfo` aus `src/ui/ReleaseInfo.tsx`: sichtbare Build-/Release-Information.

Diese Module nicht zu generischen Primitives verbreitern; ihre Fachverantwortung bleibt Bestandteil der Schnittstelle.

## Entscheidungshilfe für neue UI

1. Ist es eine normale Aktion, Icon-Aktion, Oberfläche, Statusmeldung oder ein vorhandenes Spezialmodul? Dann zuerst den passenden Eintrag oben prüfen.
2. Passt dessen Semantik und Accessibility-Verhalten vollständig? Dann direkt importieren.
3. Benötigen mindestens drei aktuelle Stellen dieselbe neue Struktur oder wird wichtiges zugängliches Verhalten zentralisiert? Dann eine kleine gemeinsame Seam erwägen.
4. Andernfalls lokal und semantisch mit den zentralen Theme-/Typografie-Tokens implementieren; keine parallele Palette oder Button-Grundlogik anlegen.
