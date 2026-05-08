import { type PointerEvent } from "react";
import { useAssistantStore } from "../store/assistantStore";
import styles from "@shared/styles/assistant/assistant-panel.module.css";

type AssistantHeaderProps = {
  isDraggable: boolean;
  showBurgerMenu?: boolean;
  onDragStart: (event: PointerEvent<HTMLDivElement>) => void;
};

export function AssistantHeader({
  isDraggable,
  showBurgerMenu = false,
  onDragStart,
}: AssistantHeaderProps) {
  const closeAssistant = useAssistantStore((state) => state.closeAssistant);
  const toggleConversationDrawer = useAssistantStore((state) => state.toggleConversationDrawer);

  return (
    <div
      className={styles.header}
      onPointerDown={onDragStart}
      data-draggable={isDraggable}
    >
      <div className={styles.headerLeft}>
        {showBurgerMenu && (
          <button
            type="button"
            className={styles.burgerButton}
            onClick={(e) => {
              e.stopPropagation();
              toggleConversationDrawer();
            }}
            aria-label="Toggle conversations menu"
          >
            Menu
          </button>
        )}
        <div>
          <p className={styles.eyebrow}>Shopping copilot</p>
          <h2 className={styles.title}>AI Shopping Assistant</h2>
        </div>
      </div>
      <button
        type="button"
        className={styles.closeButton}
        onClick={closeAssistant}
        aria-label="Close assistant"
      >
        Close
      </button>
    </div>
  );
}
