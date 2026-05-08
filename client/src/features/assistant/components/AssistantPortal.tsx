import { createPortal } from "react-dom";
import { useAssistantStore } from "../store/assistantStore";
import { AssistantPanel } from "./AssistantPanel";

export function AssistantPortal() {
  const isOpen = useAssistantStore((state) => state.isOpen);

  if (!isOpen) {
    return null;
  }

  return createPortal(<AssistantPanel />, document.body);
}
