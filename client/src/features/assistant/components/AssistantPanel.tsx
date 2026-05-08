import {
  type CSSProperties,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type PanelPosition,
  useAssistantStore,
} from "../store/assistantStore";
import { AssistantHeader } from "./AssistantHeader";
import { ConversationList } from "./ConversationList";
import { ConversationDrawer } from "./ConversationDrawer";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import styles from "@shared/styles/assistant/assistant-panel.module.css";

const DEFAULT_PANEL_WIDTH = 760;
const MIN_PANEL_WIDTH = 420;
const MAX_PANEL_WIDTH = 1000;
const MIN_PANEL_HEIGHT = 520;
const MAX_PANEL_HEIGHT = 900;
const NARROW_THRESHOLD = 600;
const VIEWPORT_MARGIN = 16;
const VERTICAL_MARGIN = 40; // Total vertical margin (top + bottom)
const MOBILE_QUERY = "(max-width: 700px)";

function getViewportBasedPanelHeight(): number {
  const availableHeight = window.innerHeight - VERTICAL_MARGIN;
  return Math.max(
    MIN_PANEL_HEIGHT,
    Math.min(availableHeight, MAX_PANEL_HEIGHT)
  );
}

function getDefaultPanelPosition(width = DEFAULT_PANEL_WIDTH): PanelPosition {
  const height = getViewportBasedPanelHeight();
  return {
    x: Math.max(VIEWPORT_MARGIN, window.innerWidth - width - 24),
    y: Math.max(VIEWPORT_MARGIN / 2, (window.innerHeight - height) / 2),
  };
}



function clampPanelPosition(position: PanelPosition, panel: HTMLElement) {
  const width = panel.offsetWidth || DEFAULT_PANEL_WIDTH;
  const height = panel.offsetHeight || getViewportBasedPanelHeight();
  const verticalMarginHalf = VERTICAL_MARGIN / 2;

  return {
    x: Math.min(
      Math.max(VIEWPORT_MARGIN, position.x),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    ),
    y: Math.min(
      Math.max(verticalMarginHalf, position.y),
      Math.max(verticalMarginHalf, window.innerHeight - height - verticalMarginHalf),
    ),
  };
}

function useIsMobileAssistant() {
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const handleChange = () => setIsMobile(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return isMobile;
}

type InteractionState = {
  mode: "idle" | "drag" | "resize-left" | "resize-right";
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
  startWidth: number;
};

export function AssistantPanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<InteractionState>({
    mode: "idle",
    startPointerX: 0,
    startPointerY: 0,
    startX: 0,
    startY: 0,
    startWidth: 0,
  });
  
  // Current values from Zustand
  const position = useAssistantStore((state) => state.panelPosition);
  const panelSize = useAssistantStore((state) => state.panelSize);
  const setPanelPosition = useAssistantStore((state) => state.setPanelPosition);
  const setPanelWidth = useAssistantStore((state) => state.setPanelWidth);
  
  // Refs to avoid stale closures
  const panelPositionRef = useRef<PanelPosition | null>(null);
  const panelWidthRef = useRef<number>(DEFAULT_PANEL_WIDTH);
  
  const isMobile = useIsMobileAssistant();
  const [panelHeight, setPanelHeight] = useState(() => getViewportBasedPanelHeight());
  
  const currentWidth = panelSize?.width || DEFAULT_PANEL_WIDTH;
  const isNarrowMode = !isMobile && currentWidth < NARROW_THRESHOLD;

  // Keep refs synced with latest Zustand values
  panelPositionRef.current = position;
  panelWidthRef.current = currentWidth;

  useEffect(() => {
    if (isMobile) {
      return;
    }

    if (!position) {
      setPanelPosition(getDefaultPanelPosition(currentWidth));
      return; // Early return after setting initial position to avoid other operations
    }

    if (!panelSize) {
      setPanelWidth(DEFAULT_PANEL_WIDTH);
    }

    // Ensure panel height is updated based on current viewport
    const currentHeight = getViewportBasedPanelHeight();
    if (currentHeight !== panelHeight) {
      setPanelHeight(currentHeight);
    }
  }, [isMobile, position, panelSize, setPanelPosition, setPanelWidth, currentWidth]);

  useEffect(() => {
    if (isMobile) {
      return;
    }

    const handleResize = () => {
      const newHeight = getViewportBasedPanelHeight();
      setPanelHeight(newHeight);

      // Only clamp position if not currently interacting
      if (interactionRef.current.mode === "idle" && position && panelRef.current) {
        const clampedPosition = clampPanelPosition(position, panelRef.current);
        if (clampedPosition.x !== position.x || clampedPosition.y !== position.y) {
          setPanelPosition(clampedPosition);
        }
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMobile, position, setPanelPosition]);

  const handlePointerMove = useCallback((event: globalThis.PointerEvent) => {
    const interaction = interactionRef.current;
    if (interaction.mode === "idle" || !panelRef.current) {
      return;
    }

    const deltaX = event.clientX - interaction.startPointerX;
    const deltaY = event.clientY - interaction.startPointerY;

    if (interaction.mode === "drag") {
      const nextX = interaction.startX + deltaX;
      const nextY = interaction.startY + deltaY;

      // Clamp to viewport with 12px margins
      const currentWidth = panelWidthRef.current;
      const clampedX = Math.max(12, Math.min(nextX, window.innerWidth - currentWidth - 12));
      const clampedY = Math.max(12, Math.min(nextY, window.innerHeight - panelHeight - 12));

      // Only update if position changed
      const currentPos = panelPositionRef.current;
      if (!currentPos || currentPos.x !== clampedX || currentPos.y !== clampedY) {
        setPanelPosition({ x: clampedX, y: clampedY });
      }
    } else if (interaction.mode === "resize-right") {
      const nextWidth = interaction.startWidth + deltaX;

      // Clamp width and ensure it fits in viewport
      const currentPos = panelPositionRef.current;
      const maxWidth = currentPos ? window.innerWidth - currentPos.x - 12 : MAX_PANEL_WIDTH;
      const clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(nextWidth, MAX_PANEL_WIDTH, maxWidth));

      // Only update if width changed
      const currentWidth = panelWidthRef.current;
      if (currentWidth !== clampedWidth) {
        setPanelWidth(clampedWidth);
      }
    } else if (interaction.mode === "resize-left") {
      const rightEdge = interaction.startX + interaction.startWidth;
      
      const nextX = interaction.startX + deltaX;
      const nextWidth = rightEdge - nextX;

      // Clamp constraints
      let clampedX = Math.max(12, nextX);
      let clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(nextWidth, MAX_PANEL_WIDTH));
      
      // If width hits limits, adjust x to keep right edge stable
      if (nextWidth < MIN_PANEL_WIDTH) {
        clampedX = rightEdge - MIN_PANEL_WIDTH;
        clampedWidth = MIN_PANEL_WIDTH;
      } else if (nextWidth > MAX_PANEL_WIDTH) {
        clampedX = rightEdge - MAX_PANEL_WIDTH;
        clampedWidth = MAX_PANEL_WIDTH;
      }

      // Final x clamp
      clampedX = Math.max(12, clampedX);

      // Only update if values changed
      const currentPos = panelPositionRef.current;
      const currentWidth = panelWidthRef.current;
      
      if (currentWidth !== clampedWidth) {
        setPanelWidth(clampedWidth);
      }
      if (!currentPos || currentPos.x !== clampedX) {
        setPanelPosition({ x: clampedX, y: currentPos?.y || interaction.startY });
      }
    }
  }, [setPanelPosition, setPanelWidth, panelHeight]);

  const handlePointerUp = useCallback(() => {
    interactionRef.current.mode = "idle";
    
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, [handlePointerMove]);

  const startResizeLeft = (event: PointerEvent<HTMLDivElement>) => {
    if (isMobile || !panelPositionRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    interactionRef.current = {
      mode: "resize-left",
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: panelPositionRef.current.x,
      startY: panelPositionRef.current.y,
      startWidth: panelWidthRef.current,
    };

    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const startResizeRight = (event: PointerEvent<HTMLDivElement>) => {
    if (isMobile || !panelPositionRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    interactionRef.current = {
      mode: "resize-right",
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: panelPositionRef.current.x,
      startY: panelPositionRef.current.y,
      startWidth: panelWidthRef.current,
    };

    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (isMobile || !panelPositionRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    interactionRef.current = {
      mode: "drag",
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: panelPositionRef.current.x,
      startY: panelPositionRef.current.y,
      startWidth: panelWidthRef.current,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      
      // Clean up interaction state and styles
      interactionRef.current.mode = "idle";
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [handlePointerMove, handlePointerUp]);

  const panelStyle: CSSProperties | undefined =
    !isMobile && position
      ? {
          left: position.x,
          top: position.y,
          right: "auto",
          bottom: "auto",
          width: currentWidth,
          height: panelHeight,
        }
      : undefined;

  return (
    <section
      ref={panelRef}
      className={styles.panel}
      style={panelStyle}
      aria-label="AI Shopping Assistant"
      data-narrow={isNarrowMode}
    >
      {!isMobile && (
        <>
          <div
            className={`${styles.resizeHandle} ${styles.resizeHandleLeft}`}
            onPointerDown={startResizeLeft}
            aria-label="Resize panel width from left edge"
          />
          <div
            className={`${styles.resizeHandle} ${styles.resizeHandleRight}`}
            onPointerDown={startResizeRight}
            aria-label="Resize panel width from right edge"
          />
        </>
      )}
      <AssistantHeader 
        onDragStart={startDrag} 
        isDraggable={!isMobile}
        showBurgerMenu={isNarrowMode}
      />
      <div className={styles.body}>
        {!isNarrowMode && <ConversationList />}
        <div className={styles.chat}>
          <MessageList />
          <ChatInput />
        </div>
      </div>
      {isNarrowMode && <ConversationDrawer />}
    </section>
  );
}
