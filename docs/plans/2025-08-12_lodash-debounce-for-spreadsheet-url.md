## Goal

Replace hand-rolled `setTimeout`-based debounce for persisting `spreadsheetUrl` in `src/store/mainStore.ts` with `lodash.debounce` to reduce edge-case bugs and simplify logic.

## Constraints / Notes

- Keep immediate updates for UI: `spreadsheetUrl`, validation, and `sheetsConfig` must still update on every keystroke.
- Only persistence to `AsyncStorage` should be debounced.
- Respect `skipPersist` flag to avoid persisting during initialization.
- Ensure the debounced function is stable across calls and properly canceled when necessary.
- Prefer `lodash.debounce` (the standalone package) for lighter bundle.

## Plan

1. Add `lodash.debounce` import in `src/store/mainStore.ts`.
2. Introduce a private debounced function instance on store state (e.g. `_persistSpreadsheetUrlDebounced`) to avoid recreating per call.
3. On first use, create the debounced function capturing `get`/`set` via closure so it can read freshest state and `url`.
4. Replace manual `setTimeout` logic with invoking the debounced function, and remove `_spreadsheetUrlDebounceTimer` field.
5. Add cleanup: cancel debounced persistence when needed (e.g., optional cancel before rescheduling not required; lodash handles trailing call). Optionally cancel on app background if necessary later.
6. Run `bun run signal` to ensure type/lint pass.

## Rollback

If issues occur, revert to previous manual debounce logic.
