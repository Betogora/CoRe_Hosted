import React from "react";
import type { HelpTopic } from "../appNavigation.ts";
import { useAppServices } from "../useAppServices.ts";
import { HelpScreen } from "./HelpScreen.tsx";

export function HelpScreenWiring() {
  const { navigation } = useAppServices();
  // A topic opened from the entry goes back through history, so browser back after it does not return to the topic.
  const topicPushedRef = React.useRef(false);
  const selectTopic = (topic: HelpTopic | null) => {
    if (!topic && topicPushedRef.current) {
      topicPushedRef.current = false;
      window.history.back();
      return;
    }
    topicPushedRef.current = Boolean(topic);
    navigation.navigateToView("hilfe", topic ? { helpTopic: topic } : {}, { replace: !topic });
  };
  return <HelpScreen topic={navigation.helpTopic} onSelectTopic={selectTopic} />;
}
