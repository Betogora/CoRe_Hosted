import React from "react";
import {
  Asterisk,
  BadgeDollarSign,
  BookOpen,
  Braces,
  Brain,
  Briefcase,
  ChartColumn,
  Circle,
  Dumbbell,
  FlaskConical,
  Flower2,
  Folder,
  Gift,
  Globe,
  GraduationCap,
  Heart,
  Microscope,
  Music,
  Notebook,
  Palette,
  PenLine,
  Pencil,
  Plane,
  Scale,
  School,
  Scissors,
  ShoppingBag,
  SquareTerminal,
  Stethoscope,
  Wrench,
} from "lucide-react";
import { DECK_ICON_KEYS, normalizeDeckAppearance } from "../coreModel.js";

const iconByKey = {
  "badge-dollar": BadgeDollarSign,
  "book-open": BookOpen,
  "chart-column": ChartColumn,
  "graduation-cap": GraduationCap,
  "pen-line": PenLine,
  "shopping-bag": ShoppingBag,
  asterisk: Asterisk,
  braces: Braces,
  brain: Brain,
  briefcase: Briefcase,
  circle: Circle,
  dumbbell: Dumbbell,
  flask: FlaskConical,
  flower: Flower2,
  folder: Folder,
  gift: Gift,
  globe: Globe,
  heart: Heart,
  microscope: Microscope,
  music: Music,
  notebook: Notebook,
  palette: Palette,
  pencil: Pencil,
  plane: Plane,
  scale: Scale,
  school: School,
  scissors: Scissors,
  stethoscope: Stethoscope,
  terminal: SquareTerminal,
  wrench: Wrench,
};

const labelByKey = {
  "badge-dollar": "Finanzen",
  "book-open": "Buch",
  "chart-column": "Diagramm",
  "graduation-cap": "Studium",
  "pen-line": "Notiz",
  "shopping-bag": "Tasche",
  asterisk: "Stern",
  braces: "Code",
  brain: "Gehirn",
  briefcase: "Koffer",
  circle: "Kreis",
  dumbbell: "Training",
  flask: "Labor",
  flower: "Blume",
  folder: "Ordner",
  gift: "Geschenk",
  globe: "Globus",
  heart: "Herz",
  microscope: "Mikroskop",
  music: "Musik",
  notebook: "Notizbuch",
  palette: "Palette",
  pencil: "Stift",
  plane: "Flugzeug",
  scale: "Waage",
  school: "Schule",
  scissors: "Schere",
  stethoscope: "Medizin",
  terminal: "Terminal",
  wrench: "Werkzeug",
};

export const deckIconOptions = DECK_ICON_KEYS.map((key) => ({
  key,
  label: labelByKey[key] ?? key,
  icon: iconByKey[key] ?? BookOpen,
}));

export function getDeckIcon(iconKey) {
  return iconByKey[iconKey] ?? BookOpen;
}

export function getDeckAppearance(deckOrAppearance = {}) {
  const appearance = deckOrAppearance?.deckSettings?.appearance ?? deckOrAppearance?.appearance ?? deckOrAppearance;
  return normalizeDeckAppearance(appearance);
}

export function DeckAppearanceIcon({ deck, appearance, className = "size-10 rounded-xl bg-[#eef1fb]", iconSize = 18, ...props }) {
  const normalizedAppearance = getDeckAppearance(appearance ?? deck);
  const Icon = getDeckIcon(normalizedAppearance.iconKey);

  return (
    <span
      {...props}
      className={`grid shrink-0 place-items-center ${className}`}
      style={{
        color: normalizedAppearance.iconColor,
        ...(props.style ?? {}),
      }}
    >
      <Icon size={iconSize} aria-hidden="true" />
    </span>
  );
}
