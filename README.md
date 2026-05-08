# AI Commerce Copilot

A production-focused local AI shopping copilot backend built for safe product discovery inside chat. Submitted as an assessment project — intentionally scoped for local, single-instance review.

The system combines deterministic intent routing, grounded product retrieval from DummyJSON, and post-LLM validation to prevent hallucinated recommendations from reaching users.

**Stack**: Node.js · Express · TypeScript · SQLite (better-sqlite3) · OpenAI (gpt-5.4-mini / gpt-5.4-nano) · DummyJSON · Vitest

---

## Why this project exists

This was built as an AI commerce copilot take-home assessment. The objective was not maximum feature breadth. The focus was coherent chat-based product discovery, safe LLM usage, deterministic backend behavior, and clearly reasoned engineering trade-offs. The app runs locally as required by the assignment.

---

## Assignment Coverage

| Assignment requirement | Implementation |
|---|---|
| Conversational experience | Chat endpoint with persisted conversation flow |
| Product discovery | Rule-based intent analysis + keyword retrieval from DummyJSON |
| In-chat product rendering | `ProductCard[]` returned with each assistant message (title, description, price, image, rating) |
| Conversation persistence | SQLite-backed conversation and message history; survives page refresh |
| Conversation management | Create conversation, list past conversations, continue existing conversation, delete conversation |
| Tests / evaluation | 117 Vitest tests covering assistant routing, intent analysis, grounding guard, ranking stability, HTTP layer |
| Local runnable app | `npm install` · `npm run dev` |

---

## Core Features

- Natural language shopping query understanding (rule-based, no LLM for classification)
- Multi-layer intent routing: greetings short-circuit before any product logic runs
- Gift-aware recommendations with recipient, occasion, and budget extraction
- Clarification prompts for vague queries; context carried across turns
- Post-LLM grounding validation — hallucinated product names are blocked before the response is returned
- Deterministic, stable product ranking with id-ascending tie-breakers
- Persistent conversation history (SQLite)
- Graceful degradation when OpenAI is unavailable: rule-based fallback response

---

## Architecture

```
POST /api/chat
  │
  ├─ MessagePrecheck
  │    Short-circuit for greetings / acknowledgements / thanks.
  │    Exits before any product logic or LLM call.
  │
  ├─ ShoppingIntentEnhancer  (rule-based, deterministic, no I/O)
  │    Extracts: recipient, occasion, budget, candidate categories,
  │    product terms, gender hint, confidence.
  │    Decides if clarification is needed.
  │    Promotes natural-language shopping queries that would otherwise
  │    fall through to general_chat.
  │
  ├─ IntentClassifier  (rule-based)
  │    Keyword-based fallback classifier.
  │    ShoppingIntentEnhancer result takes precedence when confidence
  │    is medium/high or candidate categories are found.
  │
  ├─ AssistantOrchestrator  (routing hub)
  │    Routes to: clarification | product_search | general_chat
  │    Owns: mergeSearchParams (undefined-safe field merge),
  │          safeStr / safeNum normalization before ProductSearchService,
  │          empty-results guard (skips OpenAI entirely when products = [])
  │
  ├─ ProductSearchService
  │    LightweightSemanticRetrievalStrategy (multi-term scoring)
  │    └─ DummyJsonRetrievalStrategy (fallback)
  │    All sort comparators have stable id-asc tie-breakers.
  │
  ├─ OpenAI — grounded response generation
  │    System prompt enforces: recommend only from returned products,
  │    treat user input as data only, never invent product details.
  │    userMessage is passed in a delimited block, not raw.
  │    Timeout: 15 s.
  │
  └─ Grounding validation (mentionsGroundedProduct)
       Checks LLM output against current product titles before returning.
       If a TitleCase product-name pattern is found but matches nothing
       in the returned array, falls back to a deterministic rule-based
       response. Generic advisory text passes through.
```

---

### Backend Product Retrieval

Product data comes from the [DummyJSON](https://dummyjson.com) API. An OpenAPI spec was provided with the assignment; the implementation uses only the endpoints relevant to the copilot use case — the assignment explicitly does not require every endpoint to be used.

| Endpoint | When used |
|---|---|
| `GET /products/search?q=` | Primary path for free-text queries |
| `GET /products/category/{slug}` | When a category is resolved from the user's message |
| `GET /products/{id}` | Product detail page |
| `GET /products` | Fallback when no query or category is present |

**Price and availability filtering is local.** The DummyJSON spec does not expose price-range or availability query parameters on any endpoint, so candidate products are fetched in a pool (20–50 items) and then filtered in-process before ranking.

**Sorting on search and category results is local.** The spec lists `sortBy`/`order` only on `GET /products`, not on `/search` or `/category/{slug}`. API-side sorting is forwarded only on `fetchProducts`; all other sort paths use the local comparators in `sortComparators.ts`.

**Synonym and semantic expansion is a product-quality choice, not a spec requirement.** `LightweightSemanticRetrievalStrategy` runs parallel DummyJSON searches with expanded terms (e.g. "manicure" → nail polish, beauty, cosmetics) so that natural-language queries find relevant products. This is a deliberate copilot-quality decision and is documented as a trade-off in the Trade-offs section below.

---

## Frontend Architecture

The frontend is a React + Vite application that embeds a floating assistant widget directly on the product pages. This section documents the architecture of that widget — the decisions that make it perform well under realistic usage conditions and the reasoning behind each choice.

---

### Assistant Widget UI

The assistant renders as a floating overlay via a **React Portal**, attached to `document.body` rather than the page component tree. This keeps the widget completely decoupled from page layout — it can sit on top of any route without the host page knowing it exists, and z-index concerns are isolated to the portal layer.

The panel is **draggable** (user can reposition it anywhere on the screen) and **resizable** from the right edge. Both position and width are persisted in `localStorage` so the user's preferred layout survives page refreshes. On first open the panel appears at a sensible default position; subsequent opens restore the last-used placement.

The widget remembers the **last active conversation** via `activeConversationId` (also persisted). When the user reopens the assistant, it validates this ID against the server before restoring it — if the conversation was deleted or the database was reset, it falls back to the most recently updated conversation, or creates a new one.

---

### State Management Strategy

Two libraries with non-overlapping responsibilities:

**TanStack Query** owns all server state:

| Query key | What it manages |
|---|---|
| `['conversations']` | Conversation list — fetched on open, invalidated after create/delete |
| `['messages', conversationId]` | Paginated message history — `useInfiniteQuery`, cursor-based |

After each mutation (send, create, delete), the relevant query keys are invalidated. The cache is the single runtime source of truth for server data — nothing is manually copied into Zustand.

**Zustand** owns only UI and session state:

| Field | Purpose |
|---|---|
| `isOpen` | Widget open/close |
| `activeConversationId` | Which conversation is selected |
| `panelPosition`, `panelSize` | Draggable/resizable widget geometry |
| `isConversationDrawerOpen` | Mobile drawer toggle |
| `isSending`, `error`, `lastFailedAction` | Transient UI state for send flow |

Mutations (send message, create conversation, delete conversation) live in the Zustand store because they require cross-cutting orchestration — picking the next active conversation, sequencing navigation and cache invalidation, managing error/retry state across components. After each mutation the store calls `queryClient.invalidateQueries` rather than manually updating arrays.

This split avoids the most common local-state mistake: duplicating server data into a global store and then having to keep two copies in sync.

---

### Message List Performance

Long conversations are the primary performance concern for a chat widget. Two layers address it:

**Cursor-based pagination**

The backend exposes `GET /conversations/:id/messages?limit=30&before=<cursor>`. The initial load fetches the latest page only. Older messages are fetched on demand as the user scrolls upward, using TanStack Query's `useInfiniteQuery` with `fetchPreviousPage`. Pagination uses the message `id` as the cursor — stable, index-friendly, and immune to the offset-drift problem (offset pagination breaks when messages are inserted while the user is reading).

**Virtualization with react-virtuoso**

Even with pagination, all fetched pages remain mounted in a flat `Array.map`. After several upward scrolls this can reach hundreds of DOM nodes — each with layout cost, event listeners, and memory. `react-virtuoso` renders only the items currently in (or near) the viewport, replacing off-screen nodes with lightweight spacer elements.

Virtuoso was chosen over `react-window` and `@tanstack/react-virtual` because it handles **variable-height items natively** (product-card messages are significantly taller than text messages), integrates directly with prepend pagination via `firstItemIndex`, and exposes `startReached` and `followOutput` callbacks that replace the manual scroll event logic.

Key scroll behaviours preserved through virtualization:

- **Scroll position on prepend** — when `fetchPreviousPage` completes, `firstItemIndex` is decremented by the number of newly prepended items. Virtuoso compensates `scrollTop` internally before paint, with no `useLayoutEffect` scroll arithmetic required.
- **Auto-scroll on new messages** — `followOutput` returns `"smooth"` only when the user is already within 150 px of the bottom, so new messages scroll into view naturally without interrupting a user reading history.
- **"Scroll to latest" button** — a floating button appears whenever the user scrolls more than 150 px from the bottom, providing a clear path back. `atBottomStateChange` drives button visibility at threshold-crossing events only, not on every scroll tick.
- **Conversation switch** — `key={activeConversationId}` forces a full Virtuoso remount on every switch, so `initialTopMostItemIndex` always places the new conversation at the latest message. Scroll state from the previous conversation cannot leak. `firstItemIndex` is reset synchronously during the render pass (React's derived-state pattern) so the new Virtuoso instance never sees a stale value.

---

### Product Card Performance

Product cards appear inside assistant messages and scroll through the virtualized list. Two issues arise at this intersection: decode jank and layout shift.

**Decode jank** — without `decoding="async"`, each image entering the Virtuoso viewport is decoded on the main thread, competing with scroll compositing and causing jitter. `decoding="async"` offloads decoding to a worker thread.

**Layout shift (CLS)** — the product card image container has a fixed `height: 140px` with a `background: #f9fafb` placeholder, so the card height is determined by CSS before the image loads. No reflow occurs when the image arrives. The product detail page image uses `aspect-ratio: 1/1` with `object-fit: contain` for the same reason (DummyJSON thumbnails are square; the space is reserved before the network response arrives).

`loading="lazy"` on carousel card images delays the network fetch for off-screen cards. `draggable={false}` prevents accidental drag events on images inside the horizontally scrolling carousel from interfering with the scroll gesture.

---

### Persistence Strategy

`localStorage` stores exactly four fields, via Zustand's `persist` middleware with an explicit `partialize` allowlist:

```
isOpen                 — boolean
activeConversationId   — string | null
panelPosition          — { x, y } | null
panelSize              — { width } | null
```

Total storage cost is under 200 bytes regardless of conversation history length.

Nothing else is persisted:

| Not persisted | Reason |
|---|---|
| `messages` | SQLite is the source of truth; React Query fetches on demand |
| `conversations` | Same — React Query cache; invalidated and refetched after mutations |
| `activeConversation` (full object) | Only the ID is needed; the full object comes from the cache |
| `isSending`, `error`, `lastFailedAction` | Transient UI state; meaningless after a page reload |
| React Query cache | No `persistQueryClient` or `createSyncStoragePersister` configured |

The React Query cache lives in memory only. `gcTime` is set to 10 minutes so switching between conversations does not re-fetch recently loaded message pages, but the cache is not written to storage and is rebuilt on next open.

Offline support is not intended. The app requires a running local server; `refetchOnReconnect: true` handles the case of a brief local network interruption.

---

### UX Decisions

**No refetch on window focus.** `refetchOnWindowFocus: false` is set globally on the `QueryClient`. In a chat context, a background refetch triggered by alt-tab would reset `useInfiniteQuery`'s page structure and potentially restart the virtualized list's scroll position. Data freshness is driven by explicit mutation invalidation, not by focus events.

**Conservative retry.** Queries retry once (`retry: 1`) — enough to recover from a transient network blip without masking a real failure behind three rounds of invisible waiting. Mutations retry zero times (`retry: 0`) — an accidental duplicate `sendMessage` would insert two identical messages with no recovery path.

**Error and retry flow.** When a mutation fails, the store records `lastFailedAction`. The UI surfaces an inline error with a Retry button that re-executes exactly the failed action. This covers all async actions: open assistant, create conversation, delete conversation, send message.

**Conversation validation on open.** The persisted `activeConversationId` is always validated against the live server list before use. A stale ID (deleted conversation, wiped database during development) falls back gracefully to the most recently updated conversation, or creates a new one if none exist.

**`staleTime: 5 minutes`.** Conversations and messages are treated as fresh for 5 minutes. Within a session the user's own mutations drive all invalidations, so this window only matters for edge cases (another session modified data). It avoids background re-fetches during normal usage while still providing a safety net.

---

## Engineering Decisions

**No vector DB.**
Product retrieval uses keyword scoring against DummyJSON categories and titles. For an assessment with a fixed external catalog, a vector index adds operational complexity (embedding sync, index rebuild, storage) without meaningful recall improvement. The current retrieval is transparent, deterministic, and easy to trace. Switching to vector search is a straightforward strategy swap — `ProductRetrievalStrategy` is the only interface that changes.

**Post-LLM grounding validation.**
Prompt instructions alone are not sufficient enforcement. Even with explicit system rules, LLMs can generate product names not present in the retrieved set. The `mentionsGroundedProduct` helper runs on every OpenAI response before it is returned to the caller. If an ungrounded product-name pattern is detected, the response is replaced with a deterministic rule-based fallback. This makes the anti-hallucination guarantee a backend invariant, not a model behaviour assumption.

**Rule-based intent classification.**
Routing decisions (product search vs. clarification vs. general chat) are made by deterministic code, not by an LLM. This means routing is testable, predictable, and free of latency. OpenAI is only called for *response generation* after products are already retrieved.

**Deterministic ranking with stable tie-breakers.**
All sort comparators include an `id` ascending secondary sort. Without this, JavaScript's `Array.sort` is not guaranteed stable across engines and runtimes, meaning identical queries could return products in different orders between requests, causing LLM recommendations to drift. The tie-breaker removes that non-determinism.

**SQLite.**
Appropriate for a single-instance deployment and removes the operational dependency on a managed database during assessment review. The schema is simple; migrating to PostgreSQL is a connection-string and query-style change, not an architectural one.

**In-memory rate limiting.**
`express-rate-limit` with the default memory store is correct for a single-process server. State resets on restart, which is an acceptable trade-off at this scale. A Redis-backed store would be required before horizontal scaling.

---

## Framework and Retrieval Choices

### Why no AI agent framework

For this assessment, orchestration is implemented explicitly rather than through a framework. The project is small, locally runnable, and the reviewer should be able to inspect routing, retrieval, grounding, and tests directly without unpacking framework abstractions.

If the project grew, here is when each option would become relevant:

**Mastra / LangChain**
Useful in a larger production system with multi-step agent workflows, tools, memory, retries, tracing, or complex orchestration. Worth considering if the assistant needed to call multiple tools, compare products across sources, ask follow-up questions through a formal agent loop, or execute long-running workflows.

**Vercel AI SDK**
Useful if the project needed streaming chat responses, React/Next.js-first AI UI integration, structured model outputs, and cleaner client/server LLM boilerplate. Worth considering if the chat UX became streaming-first and the main pain point was client/server wiring rather than backend safety logic.

**assistant-ui**
Useful for accelerating chat UI development when the main challenge is frontend experience: message rendering, composer, threads, attachments, and streaming UI states. Worth considering if the assessment focus were more on polished chat UI than backend correctness.

**CopilotKit**
Useful when embedding an AI copilot deeply inside an existing application UI, where the assistant needs access to app state and can trigger UI actions. Worth considering if the copilot needed to control filters, cart actions, saved products, or user-specific workflows inside the app.

**LibreChat**
Useful as a full chat platform baseline when the goal is multi-provider chat, users, conversations, plugins, and admin-style chat features. Not appropriate for this assessment — it would hide the core backend decisions behind an existing product.

---

### Why no vector DB

For the current DummyJSON catalog, deterministic keyword and category retrieval is sufficient and easier to test and trace.

In a real production commerce catalog — with many products, long descriptions, synonyms, typo tolerance, personalization, and vague natural-language queries — I would add semantic retrieval:

```
User message
  → intent extraction
  → embeddings
  → vector DB / pgvector search
  → candidate product set
  → deterministic business ranking
  → LLM response generation
  → post-LLM grounding validation
```

Vector retrieval would replace or augment the current DummyJSON keyword retrieval strategy. It would **not** replace grounding validation — the backend would still verify that any recommended product is present in the retrieved candidate set before returning it to the user.

Retrieval options worth evaluating at that point:
- **pgvector** — if PostgreSQL is already the main product database; keeps the stack simple
- **Pinecone / Weaviate / Qdrant** — if a dedicated vector search service is more appropriate for the catalog size or query volume
- **Hybrid search** — if both keyword precision and semantic recall are important (e.g. exact SKU lookups alongside natural-language queries)

Production-scale retrieval would evolve from the current:

```
DummyJSON keyword retrieval → deterministic ranking
```

to:

```
Product catalog
  → embedding pipeline
  → vector DB / pgvector
  → semantic candidate retrieval
  → deterministic business ranking
  → grounded LLM response
  → post-generation grounding validation
```

---

## Final Audit Result

Final backend audit verdict: **safe to deploy for single-instance deployment.**

The backend has explicit protections for:
- hallucinated product recommendations (post-LLM grounding guard)
- unsafe routing decisions (deterministic rule-based classifier, no LLM routing)
- unstable retrieval ordering (stable id-asc tie-breakers on all sort comparators)
- unbounded OpenAI / DummyJSON request execution (15 s and 5 s timeouts)
- oversized request payloads (`express.json` body limit)
- missing baseline HTTP security middleware (`helmet`, `express-rate-limit`)

This verdict is intentionally limited to single-instance scope. Horizontal production scaling would require a managed relational database, Redis-backed rate limiting, shared state, and an observability stack.

---

## Production Hardening

| Area | What was hardened |
|---|---|
| LLM hallucination | `mentionsGroundedProduct` guard blocks ungrounded product names post-generation |
| Prompt injection | System prompt isolates user input as data; explicit override-resistance rules added |
| LLM response safety | `extractIntent` JSON parse wrapped in try/catch with typed fallback; `safeStr`/`safeNum` normalize LLM-sourced search params before they reach `ProductSearchService` |
| Empty results | Deterministic guard returns hardcoded message before OpenAI is called when `products.length === 0` |
| Clarification loops | `ShoppingIntentAnalyzer` merges `recentMessages` context for partial answers; `computeNeedsClarification` returns false for non-shopping messages |
| Request timeouts | OpenAI: 15 s · DummyJSON fetch: 5 s |
| Request size | `express.json({ limit: "50kb" })` |
| Security headers | `helmet()` |
| Rate limiting | `express-rate-limit` — 100 req / IP / 15 min |
| Search param safety | `safeStr` / `safeNum` applied before `baseParams` construction |
| Product ranking | Stable id-asc tie-breakers on all sort comparators |
| Message persistence | User and assistant messages written in a single SQLite transaction — a crash mid-request cannot leave an orphaned user message without its reply |
| Retrieval latency | Expanded-term and category DummyJSON calls parallelised with `Promise.allSettled` |

---

## Testing

```bash
cd server
npm test
```

117 tests · 9 files · all deterministic · no network · no OpenAI · no SQLite.

The suite is not just a coverage metric. Each file targets a specific invariant:

| File | Invariant covered |
|---|---|
| `intelligence/tests/shoppingIntentAnalyzer.test.ts` | Deterministic extraction of recipient, occasion, budget, category; clarification policy; non-shopping suppression; `recentMessages` context merge |
| `intelligence/tests/shoppingIntentEnhancer.test.ts` | End-to-end `enhance()` output shape; gift/birthday/anniversary scenarios; product search promotion; `searchParams` correctness |
| `assistant/tests/mergeSearchParams.test.ts` | Defined enhanced values override base params; `undefined` enhanced values never overwrite valid classifier values |
| `assistant/tests/mentionsGroundedProduct.test.ts` | Grounded titles pass; hallucinated/stale TitleCase product names blocked; generic advisory text allowed |
| `assistant/tests/assistantOrchestrator.routing.test.ts` | Full routing flow: greeting short-circuit, product search, intelligence promotion, clarification branch, general chat fallback, search failure safety |
| `assistant/tests/assistantOrchestrator.grounding.test.ts` | Grounded LLM text passes; hallucinated product blocked; stale product blocked; generic text allowed; empty results skip LLM |
| `retrieval/tests/rankingStability.test.ts` | All four sort comparators; stable id-asc tie-breaker; deterministic repeated sort |
| `assistant/tests/chat.http.test.ts` | `AssistantService` unit-level: 400 for missing input, 404 for unknown conversation, successful flow, title update on first message, `recentMessages` role+content, 2 000-char limit |
| `assistant/tests/chat.integration.test.ts` | HTTP integration via Supertest: validates full Express stack for `POST /api/chat` with mocked SQLite and `ServiceContainer` |

Tests are co-located with their feature folder under `tests/` subdirectories — not in a global `__tests__` folder.

---

## Trade-offs and Non-goals

These are intentional scope decisions, not missing work:

- **No Redis / distributed rate limiting** — single-instance scope; in-memory store is correct here
- **No vector DB or embeddings** — DummyJSON is a small, fixed external catalog; keyword scoring is transparent, deterministic, and easy to test. In a real commerce system with a large catalog, semantic retrieval using embeddings and a vector DB (e.g. pgvector) would be appropriate for vague queries, synonyms, and long product descriptions — but adds operational complexity that has no payoff here
- **No worker queues** — OpenAI calls are synchronous within the request; acceptable at this scale
- **No observability stack** — structured logging and a metrics exporter (e.g. Prometheus) would be the next step for production
- **No multi-instance guarantees** — SQLite and in-memory rate limiting are single-process; horizontal scaling requires a DB swap and a shared rate-limit store
- **No per-route rate limits** — a tighter limit on `POST /api/chat` is a sensible next step but out of scope here
- **No authentication** — out of scope for this assessment; all routes are open
- **No AI agent framework** — orchestration is implemented explicitly so routing, retrieval, grounding, and tests are transparent for review. In a larger product, a framework such as Mastra, LangChain, Vercel AI SDK, assistant-ui, or CopilotKit could reduce boilerplate around streaming UI, tool orchestration, and agent workflows — but adds abstraction without assessment value here
- **DummyJSON multi-call retrieval** — `LightweightSemanticRetrievalStrategy` issues several DummyJSON API calls per query (direct search + up to 5 expanded terms + optional category fallback). The expanded-term and category calls are now parallelised with `Promise.allSettled`, so worst-case latency is one direct-search RTT plus one parallel fan-out RTT, not `n × timeout`. In production this would be replaced with a batched or indexed retrieval against a dedicated catalog (or a vector DB), eliminating per-query external API dependency entirely

---

## Local Setup

**Prerequisites**: Node.js 20+

```bash
# Install all dependencies (root installs both client and server)
npm install

# Copy environment template and add your OpenAI key
cp .env.example .env
# Edit .env: set OPENAI_API_KEY=your_key_here
```

```bash
# Start both client and server in development mode
npm run dev
```

| Service | URL |
|---|---|
| Client | http://localhost:5173 |
| Server | http://localhost:4000 |
| Health | http://localhost:4000/health |
| Products API | http://localhost:4000/api/products/search?q=laptop |

The server runs without an OpenAI key — it falls back to rule-based responses automatically.

**Environment variables** (server):

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allowed origin |
| `OPENAI_API_KEY` | — | Optional; enables LLM response generation |
| `OPENAI_MODEL` | `gpt-5.4-mini` | Set to match your API key's model access (`gpt-5.4-mini` or `gpt-5.4-nano`) |
| `OPENAI_MAX_COMPLETION_TOKENS` | `400` | Max tokens for LLM response generation |
| `SQLITE_DB_PATH` | `./data/app.db` | Created automatically |
| `DUMMYJSON_BASE_URL` | `https://dummyjson.com` | |

---

## Future Production Evolution

The assessment instructions noted technical freedom in implementation approach. This project intentionally builds the backend explicitly rather than through a framework — the goal was to make every routing, retrieval, grounding, and validation decision visible and testable for review.

### If scaling beyond this assessment

- Replace SQLite with PostgreSQL or another managed relational DB for multi-instance persistence; the repository layer is the only change surface
- Replace in-memory rate limiting with a Redis-backed store before running behind a load balancer
- Add structured logging (e.g. `pino`), metrics, tracing, and alerting
- Add per-route rate limits for LLM-heavy endpoints such as `POST /api/chat`
- Move slow or retryable LLM/product operations to a background queue if latency or reliability requires it
- Introduce semantic retrieval with a vector database or pgvector if the product catalog becomes large or text-heavy, and use embeddings to improve recall for vague or natural-language shopping queries
- Consider a framework such as Vercel AI SDK, assistant-ui, CopilotKit, LangChain, or Mastra if the project grows into a larger product and boilerplate reduction, streaming UI, tool orchestration, or agent workflows become more important — none of these were used here, but they are the natural next tier for a scaled product
