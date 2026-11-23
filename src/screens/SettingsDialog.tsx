import { CalendarClock, CalendarRange, Database, Flag, Info, Layers, Palette, Sparkles, Timer, User } from "lucide-react";
import { settingsContentSection, type GeneralSettingsSection, type LearningSettingsSection } from "../appNavigation.ts";
import type { SettingsDialogProps } from "../appScreenProps.ts";
import { SettingsDialogFrame } from "./SettingsDialogFrame.tsx";

const settingsGroups = [
  {
    label: "Allgemein",
    items: [
      { section: "konto", label: "Konto", icon: User },
      { section: "darstellung", label: "Darstellung", icon: Palette },
      { section: "daten", label: "Daten & Synchronisierung", icon: Database },
      { section: "ueber", label: "Über uns", icon: Info },
    ],
  },
  {
    label: "Lernen",
    items: [
      { section: "lerntag", label: "Lerntag & Planung", icon: CalendarClock },
      { section: "flaggen", label: "Flaggen", icon: Flag },
      { section: "fokus", label: "Fokuswerkzeuge", icon: Timer },
    ],
  },
  {
    label: "Stapel",
    items: [
      { section: "stapel", label: "Einzelne Stapel", icon: Layers },
      { section: "tagesrunde", label: "Tagesrunde & Lernprofile", icon: CalendarRange },
      { section: "scheduler", label: "Scheduler & CoRe", icon: Sparkles },
    ],
  },
] as const;

export function SettingsDialog({ section, onSelectSection, onClose, footer, children }: SettingsDialogProps) {
  return (
    <SettingsDialogFrame<GeneralSettingsSection | LearningSettingsSection>
      title="Einstellungen"
      closeLabel="Einstellungen schließen"
      navigationLabel="Bereiche der Einstellungen"
      testId="settings-dialog"
      groups={settingsGroups}
      activeSection={settingsContentSection(section)}
      showAreaList={section === "start"}
      onSelectSection={onSelectSection}
      onShowAreaList={() => onSelectSection("start")}
      onClose={onClose}
      footer={footer}
    >
      {children}
    </SettingsDialogFrame>
  );
}
