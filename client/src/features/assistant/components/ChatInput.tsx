import { type FormEvent, useState } from "react";
import { useAssistantStore } from "../store/assistantStore";
import styles from "@shared/styles/assistant/chat-input.module.css";

export function ChatInput() {
  const [value, setValue] = useState("");
  const sendMessage = useAssistantStore((state) => state.sendMessage);
  const isSending = useAssistantStore((state) => state.isSending);
  const activeConversationId = useAssistantStore((state) => state.activeConversationId);
  const error = useAssistantStore((state) => state.error);

  const hasConnectionError = error?.type === "network";
  const isUnavailable = hasConnectionError || (!activeConversationId && error);
  const canSend = value.trim().length > 0 && !isSending && !isUnavailable;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSend) {
      return;
    }

    const messageContent = value;
    setValue("");
    await sendMessage(messageContent);
  };

  return (
    <form className={styles.chatInputForm} onSubmit={handleSubmit}>
      <label className={styles.inputLabel} htmlFor="assistant-message">
        Message
      </label>
      <textarea
        id="assistant-message"
        className={styles.chatInput}
        value={value}
        rows={2}
        placeholder={
          isUnavailable 
            ? "Assistant is unavailable" 
            : isSending 
              ? "Sending..." 
              : "Ask about products..."
        }
        disabled={isSending || Boolean(isUnavailable)}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && canSend) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <button type="submit" className={styles.sendButton} disabled={!canSend}>
        {isSending ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
