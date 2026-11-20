import { useAppServices } from "../useAppServices.ts";
import { HelpScreen } from "./HelpScreen.tsx";

export function HelpScreenWiring() {
  const { navigation } = useAppServices();
  return <HelpScreen topic={navigation.helpTopic} onSelectTopic={(topic) => navigation.navigateToView("hilfe", topic ? { helpTopic: topic } : {})} />;
}
