import { db } from "../../db/sqlite.js";
import { createId } from "../../utils/ids.js";
import type { ChatMessage, Conversation, ConversationSummary } from "./conversation.types.js";
import type { ProductCard } from "../products/product.types.js";

export type ConversationMessagesPage = {
  messages: ChatMessage[];
  /** The ID to pass as `before` in the next request to load older messages. */
  nextCursor: string | null;
  hasMore: boolean;
};

export class ConversationRepository {
  listConversations(): ConversationSummary[] {
    const stmt = db.prepare(`
      SELECT 
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      GROUP BY c.id, c.title, c.created_at, c.updated_at
      ORDER BY c.updated_at DESC
    `);

    const rows = stmt.all() as Array<{
      id: string;
      title: string;
      created_at: string;
      updated_at: string;
      message_count: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
    }));
  }

  getConversationById(id: string): Conversation | null {
    const conversationStmt = db.prepare(`
      SELECT id, title, created_at, updated_at 
      FROM conversations 
      WHERE id = ?
    `);

    const conversationRow = conversationStmt.get(id) as {
      id: string;
      title: string;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!conversationRow) {
      return null;
    }

    const messagesStmt = db.prepare(`
      SELECT id, role, content, products_json, created_at
      FROM messages 
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `);

    const messageRows = messagesStmt.all(id) as Array<{
      id: string;
      role: string;
      content: string;
      products_json: string | null;
      created_at: string;
    }>;

    const messages: ChatMessage[] = messageRows.map(row => {
      const message: ChatMessage = {
        id: row.id,
        role: row.role as "user" | "assistant",
        content: row.content,
        createdAt: row.created_at,
      };

      if (row.products_json) {
        try {
          message.products = JSON.parse(row.products_json) as ProductCard[];
        } catch (error) {
          console.error(`Failed to parse products for message ${row.id}:`, error);
        }
      }

      return message;
    });

    return {
      id: conversationRow.id,
      title: conversationRow.title,
      createdAt: conversationRow.created_at,
      updatedAt: conversationRow.updated_at,
      messages,
    };
  }

  /**
   * Cursor-based pagination for messages. `before` is the rowid of the oldest
   * message the client already has (opaque to the client); omit it on the
   * initial load to get the latest `limit` messages. Results are returned in
   * ascending (oldest→newest) order so the caller can concatenate pages.
   *
   * Why rowid instead of message id:
   *   Message ids are random UUID v4 values, which are not lexicographically
   *   ordered by insertion time. Using `ORDER BY id` or `WHERE id < cursor`
   *   would produce an arbitrary, non-chronological ordering. SQLite's built-in
   *   `rowid` is a monotonically incrementing integer assigned in insertion
   *   order, making it a reliable and zero-schema-change cursor.
   */
  getConversationMessages(
    conversationId: string,
    limit: number,
    before?: string,
  ): ConversationMessagesPage {
    // Fetch newest-first (rowid DESC) so we can cursor-paginate backwards, then
    // reverse the page to ASC before returning. Fetch limit+1 to detect hasMore.
    const sql = before
      ? `SELECT rowid, id, role, content, products_json, created_at
         FROM messages
         WHERE conversation_id = ? AND rowid < ?
         ORDER BY rowid DESC
         LIMIT ?`
      : `SELECT rowid, id, role, content, products_json, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY rowid DESC
         LIMIT ?`;

    const params = before
      ? [conversationId, Number(before), limit + 1]
      : [conversationId, limit + 1];

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as Array<{
      rowid: number;
      id: string;
      role: string;
      content: string;
      products_json: string | null;
      created_at: string;
    }>;

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    // Reverse from DESC to ASC so the client receives oldest→newest per page.
    pageRows.reverse();

    const messages: ChatMessage[] = pageRows.map((row) => {
      const message: ChatMessage = {
        id: row.id,
        role: row.role as "user" | "assistant",
        content: row.content,
        createdAt: row.created_at,
      };

      if (row.products_json) {
        try {
          message.products = JSON.parse(row.products_json) as ProductCard[];
        } catch (error) {
          console.error(`Failed to parse products for message ${row.id}:`, error);
        }
      }

      return message;
    });

    // nextCursor is the rowid of the oldest message in this page (pageRows[0]
    // after reversing). The next fetchPreviousPage call sends it back as `before`,
    // and the query uses `WHERE rowid < before` to fetch the next older batch.
    const nextCursor =
      hasMore && pageRows.length > 0 ? String(pageRows[0].rowid) : null;

    return { messages, nextCursor, hasMore };
  }

  conversationExists(id: string): boolean {
    const stmt = db.prepare(`SELECT 1 FROM conversations WHERE id = ? LIMIT 1`);
    return stmt.get(id) !== undefined;
  }

  createConversation(): Conversation {
    const id = createId();
    const now = new Date().toISOString();

    const conversation: Conversation = {
      id,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };

    const stmt = db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(conversation.id, conversation.title, conversation.createdAt, conversation.updatedAt);

    return conversation;
  }

  deleteConversation(id: string): boolean {
    const stmt = db.prepare(`DELETE FROM conversations WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  addMessage(conversationId: string, message: ChatMessage): Conversation | null {
    let productsJson: string | null = null;
    if (message.products && message.products.length > 0) {
      productsJson = JSON.stringify(message.products);
    }

    const insertStmt = db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, products_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      message.id,
      conversationId,
      message.role,
      message.content,
      productsJson,
      message.createdAt
    );

    this.touchConversation(conversationId);

    return this.getConversationById(conversationId);
  }

  /**
   * Atomically persists a user message and its assistant reply in a single
   * SQLite transaction. If either write fails, neither is committed — the
   * conversation cannot end up with an orphaned user message and no reply.
   */
  addMessagePair(
    conversationId: string,
    userMessage: ChatMessage,
    assistantMessage: ChatMessage,
  ): Conversation | null {
    const insertStmt = db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, products_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const touchStmt = db.prepare(`
      UPDATE conversations SET updated_at = ? WHERE id = ?
    `);

    const assistantProductsJson =
      assistantMessage.products && assistantMessage.products.length > 0
        ? JSON.stringify(assistantMessage.products)
        : null;

    db.transaction(() => {
      insertStmt.run(
        userMessage.id,
        conversationId,
        userMessage.role,
        userMessage.content,
        null,
        userMessage.createdAt,
      );
      insertStmt.run(
        assistantMessage.id,
        conversationId,
        assistantMessage.role,
        assistantMessage.content,
        assistantProductsJson,
        assistantMessage.createdAt,
      );
      touchStmt.run(new Date().toISOString(), conversationId);
    })();

    return this.getConversationById(conversationId);
  }

  updateConversationTitle(conversationId: string, title: string): Conversation | null {
    const stmt = db.prepare(`
      UPDATE conversations 
      SET title = ?, updated_at = ?
      WHERE id = ?
    `);

    const now = new Date().toISOString();
    const result = stmt.run(title, now, conversationId);

    if (result.changes === 0) {
      return null;
    }

    return this.getConversationById(conversationId);
  }

  touchConversation(conversationId: string): void {
    const stmt = db.prepare(`
      UPDATE conversations 
      SET updated_at = ?
      WHERE id = ?
    `);

    const now = new Date().toISOString();
    stmt.run(now, conversationId);
  }
}