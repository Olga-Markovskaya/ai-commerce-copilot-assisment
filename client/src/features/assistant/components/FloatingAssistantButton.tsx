import { useAssistantStore } from "../store/assistantStore";
import { AssistantPortal } from "./AssistantPortal";
import styles from "@shared/styles/assistant/floating-assistant-button.module.css";

export function FloatingAssistantButton() {
  const isOpen = useAssistantStore((state) => state.isOpen);
  const openAssistant = useAssistantStore((state) => state.openAssistant);

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          className={styles.fab}
          onClick={openAssistant}
          aria-label="Open shopping assistant"
        >
          Assistant
        </button>
      )}
      <AssistantPortal />
    </>
  );
}
