import { useAppServices } from "../useAppServices.ts";
import { HelpScreen } from "./HelpScreen.tsx";

/** `Hilfe` with its open topic in the URL, so the browser's Back returns to the entry and topics can be shared. */
export function HelpScreenWiring() {
  const { navigation } = useAppServices();
  return <HelpScreen topic={navigation.helpTopic} onSelectTopic={(topic) => navigation.navigateToView("hilfe", topic ? { helpTopic: topic } : {})} />;
}
