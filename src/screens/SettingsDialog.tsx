import { CalendarClock, CalendarRange, Database, Flag, Info, Palette, Sparkles, Timer, User } from "lucide-react";
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
      { section: "tagesrunde", label: "Tagesrunde & Lernprofile", icon: CalendarRange },
      { section: "scheduler", label: "Scheduler & CoRe", icon: Sparkles },
      { section: "flaggen", label: "Flaggen", icon: Flag },
      { section: "fokus", label: "Fokuswerkzeuge", icon: Timer },
    ],
  },
] as const;

/** General and learning settings in the shared settings frame; `start` shows the area list on narrow screens and Konto beside it on wide ones. */
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
