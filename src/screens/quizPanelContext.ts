import React from "react";
import type { QuizPanelServices } from "./DeckQuizPanel.tsx";

/** Prototype: only the UI catalog provides the services; without them the tab `Quiz` does not exist. */
export const QuizPanelContext = React.createContext<QuizPanelServices | null>(null);
