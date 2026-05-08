# Assistant Backend Hardening

Engineering reference for the backend assistant and product-retrieval hardening work.

---

## Status

**Production ready.**

```bash
cd server
npm test
# 96 tests, 7 test files, all passing
```

---

## Hardened areas

### Message precheck
`MessagePrecheck` runs before any intelligence or product search. Greetings (`hi`, `hello`, `hey`), acknowledgements (`thanks`, `ok`, `cool`), and empty input are classified immediately and short-circuit the entire pipeline. No product search or LLM call is ever made for these inputs.

### Shopping intent intelligence
`ShoppingIntentAnalyzer` extracts recipient, occasion, budget, and candidate categories from natural language using rule-based synonym matching. Key fixes applied:
- Specific occasions (`birthday`, `anniversary`) are checked before the generic `gift` fallback — "birthday gift for wife" now correctly produces `occasion: birthday`, not `occasion: gift`.
- `computeNeedsClarification` only returns `true` when a shopping occasion is detected but lacks enough detail — messages with no shopping signals at all no longer trigger clarification.
- `recentMessages` context is merged for partial clarification replies (e.g. "for my wife" after "find a gift") so previous shopping context is not lost.

`ShoppingIntentEnhancer` runs early in `AssistantOrchestrator` — before `IntentClassifier` — so natural shopping queries (`nail polish`, `perfume for my wife`, `gift for wife under $100`) are promoted to `product_search` even when they contain no keyword-classifier keywords.

### Search params safe merge
`mergeSearchParams` in `assistantUtils.ts` only overrides `baseParams` fields that are explicitly defined in the enhanced params. `undefined` values from `ShoppingIntentEnhancer` never erase valid fields from `IntentClassifier` (e.g. `category: undefined` cannot wipe a correctly detected category).

LLM-sourced fields (`query`, `category`, `minPrice`, `maxPrice`) are normalised by `safeStr` / `safeNum` helpers inside `handleProductSearch` before reaching `ProductSearchService`, preventing malformed LLM output (e.g. `maxPrice: "oops"`, `category: {}`) from silently breaking search.

### AssistantOrchestrator routing
The routing decision tree is:
1. `MessagePrecheck` — instant exit for greetings and acknowledgements
2. `ShoppingIntentEnhancer` — synchronous, no I/O; detects shopping intent and sets `needsClarification`
3. `IntentClassifier` — keyword-based classification
4. Routing: `greeting` → greeting handler; `clarification_needed` (classifier or intelligence) → clarification handler; `product_search` → search handler; `general_chat` with shopping signal → promoted to search; otherwise → general chat

The constructor accepts an optional `deps` parameter (`productSearchService`, `openAiProvider`) for test injection. Zero-arg production construction is unchanged — `deps !== undefined` is the guard, so the production path is not affected.

### Product recommendation grounding guard
Every LLM response from `generateAssistantReply` passes through `mentionsGroundedProduct` before being returned to the caller.

The guard has three outcomes:
- **Pass** — response explicitly names at least one grounded product title (verbatim, case-insensitive).
- **Pass** — response contains no product-name-like patterns (generic advisory text, e.g. "I found a few good options based on your budget").
- **Block** — response contains TitleCase multi-word sequences (e.g. "Hoka Clifton 9", "Adidas Ultraboost") that are not in the current grounded product list. The rule-based `AssistantResponseBuilder` fallback is used instead.

Empty product results (`products.length === 0`) return a hardcoded fallback message before `generateAssistantReply` is ever called, so OpenAI is never invoked for an empty product set.

### Retrieval ranking stability
All sort comparators use `id` ascending as a stable tie-breaker:
- `byRatingDescIdAsc` — default and `rating_desc` sort
- `byPriceAscIdAsc` — `price_asc` sort
- `byPriceDescIdAsc` — `price_desc` sort
- `byScoredProductDescIdAsc` — semantic relevance sort in `LightweightSemanticRetrievalStrategy`

Products are passed to the LLM prompt in ranked order with the instruction: `"listed in relevance order — prefer earlier products when options are otherwise comparable"`.

### Test organisation
All tests live inside their feature's `tests/` subdirectory — no global `__tests__` folder. The `vitest.config.ts` is minimal (`environment: node`). No test requires OpenAI, DummyJSON, or SQLite.

---

## Safety guarantees

| Guarantee | Mechanism |
|---|---|
| Greetings and acknowledgements never trigger product search | `MessagePrecheck` exits before intelligence layer |
| Natural shopping phrases are promoted to product search | `ShoppingIntentEnhancer` runs before `IntentClassifier`; promotion logic uses `candidateCategories` and `productTerms` |
| Ambiguous requests ask for clarification, not search | `computeNeedsClarification` in `ShoppingIntentAnalyzer`; `enhanced.needsClarification` overrides `product_search` route |
| Hallucinated product names are blocked | `mentionsGroundedProduct` blocks TitleCase product-name patterns not present in current results |
| Stale products from prior conversation turns are blocked | Same guard — only current `searchResult.products` are grounded |
| Empty results return a safe deterministic message | Early return before OpenAI call when `products.length === 0` |
| Tests produce no external calls | All I/O replaced by `vi.fn()` mocks; confirmed by grep — no `fetch(`, `new OpenAI(`, `new DummyJsonClient`, or `better-sqlite3` in any test file |

---

## Key files

| File | Role |
|---|---|
| `src/features/assistant/assistant.orchestrator.ts` | Main routing and pipeline orchestration |
| `src/features/assistant/assistantUtils.ts` | `mergeSearchParams` and `mentionsGroundedProduct` — exported and tested in isolation |
| `src/features/assistant/intelligence/shoppingIntentAnalyzer.ts` | Rule-based intent extraction (budget, recipient, occasion, categories) |
| `src/features/assistant/intelligence/shoppingIntentEnhancer.ts` | Facade over analyzer + query builder + clarification policy |
| `src/features/products/retrieval/sortComparators.ts` | Exported pure sort comparators with stable id tie-breaker |
| `src/features/assistant/tests/` | Routing and grounding integration tests (mocked I/O) |
| `src/features/assistant/intelligence/tests/` | Deterministic unit tests for analyzer and enhancer |
| `src/features/products/retrieval/tests/` | Ranking stability tests for all four comparators |
| `vitest.config.ts` | Minimal Vitest config — `environment: node`, no plugins |

---

## How to verify

```bash
cd server
npm test
```

Expected output:
```
Tests  96 passed (96)
Test Files  7 passed (7)
```

No environment variables, database, or API keys required to run the test suite.

---

## Remaining non-blocking risks

**`PRODUCT_NAME_PATTERN` heuristic is conservative.**
The regex `[A-Z][a-z]{2,}(\s+(?:[A-Z][a-z]{2,}|\d+))+` blocks any TitleCase multi-word sequence not in the grounded list. In rare cases a capitalised phrase that is a category label (e.g. "Running Shoes" written with capital S) can trigger the fallback. Consequence: rule-based response is shown instead of LLM text — still safe, not broken. Monitor production logs for `"⚠️ LLM response mentions no grounded product"` if this becomes frequent.

**OpenAI temperature is 0.7 globally.**
Retrieval ranking is deterministic, but LLM prose and top-pick selection can vary across runs. Lowering temperature would stabilise recommendations but is a shared config that also affects greeting and clarification responses.

**`sanity.ts` is not wired into `npm test`.**
`src/features/assistant/intelligence/sanity.ts` is a manual development script for exploring routing decisions interactively. It is intentionally excluded from the automated suite.

---

## Future optional improvements

- **Tune grounding heuristic** — if `PRODUCT_NAME_PATTERN` produces false positives in production logs, tighten the regex or add a known-category allowlist.
- **Lower recommendation temperature** — once per-call temperature support is added to `LlmProvider`, set `temperature: 0.1–0.2` for `generateAssistantReply` calls in the recommendation path only.
- **End-to-end tests against a real test database** — if a CI environment with a seeded SQLite DB and DummyJSON fixture server is available, add a thin E2E smoke test for the full `POST /api/chat` → `AssistantOrchestrator` → `ProductSearchService` path.
