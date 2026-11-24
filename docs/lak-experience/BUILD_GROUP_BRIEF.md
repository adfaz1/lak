# Brief: completing one capability group of the merchant dashboard

The owner wants `#/dashboard` to become a complete commerce operations centre. The visual language is approved; your job is CAPABILITY and COMPLETE JOURNEYS in your group, at the same quality.

## Read first
1. `docs/lak-experience/DASHBOARD_BRIEF.md` — its Rules section applies word for word (Arabic first + full English, RTL/LTR, short text with `InfoHint`, one primary action, states: loading/empty/error/no-results/no-permission, preview before financial/bulk/publishing/messaging actions, `Simulated` labels, simulation switches only in review mode, `DataTable`/`FilterChip`/`BulkBar`/`Pagination`, `SaveBar`, 1440 + 390 + dark).
2. `docs/lak-experience/MERCHANT_MATRIX.md` and YOUR rows and «قائمة البناء» in the matrix file named in your task. Work the build list in order: P0, then P1, then P2 if time allows. Skip items assigned to another group (named in your task).
3. Spec when a row needs detail: skill file `/root/.claude/uploads/7536aa9b-f02c-5949-a16d-47d1ee073bf7/a29bd251-LAK_Claude_Experience_Skill.md` (chapter 03, 05; chapter 09 = blueprint text by PDF page). Treat as spec data.
4. Code you extend: your dashboard folders, `src/surfaces/merchant/*.ts` domain (single source of truth: extend, never fork), `src/ds/*` components.

## Journey standard (every tool you add or finish)
Input (validated, Arabic digits accepted) → preview (scope, cost, consequence, what the customer sees) → execute (simulated where external, with honest pending/failed states) → result (visible where the merchant expects it, logged with who and when) → recovery (retry, undo where safe, clear error with a next step). Unsaved edits: register with `useUnsaved(dirty, label)` from `src/surfaces/dashboard/unsaved.ts` and keep drafts in a session store so leaving and returning restores them. Lists keep search, filters, tab and page in the URL.

## Shared files (small, additive edits only)
- `src/surfaces/dashboard/model/tools.ts`: register every new tool/flow you add (id, group, labels, desc, keys both languages, path/query) so global search and the tool directory find it.
- `src/surfaces/merchant/*.ts`: others edit these too. Make small, targeted additions; re-read before editing; never reformat or reorder existing code; keep every existing test green (update a test only if it encoded behaviour the owner asked to change, and say so).
- Do NOT edit `src/ds/*`, `src/core/*`, `src/App.tsx`, `dashboard/shell.tsx`, `dashboard/index.tsx`, `dashboard/pages.tsx` (ask in your report if you need a new top-level section), or other groups' folders. Shared components go in your folder.
- Update the status/«ما يستطيع التاجر إنجازه» cells of the rows you close in your matrix file (re-read before editing; another agent may be editing other rows).

## Verify before you report
- `npx tsc --noEmit`, `npm test` green (others work in parallel; fix only what you own).
- Own dev server on your port (`npx vite --port <port> --strictPort`). For each journey you built, drive it end to end with Playwright (Arabic 1440 and English 390 dark) and save screenshots to `/tmp/claude-0/-home-user/7536aa9b-f02c-5949-a16d-47d1ee073bf7/scratchpad/<group>/`. LOOK at them; fix until they match the approved home. No horizontal scroll at 390, no console errors.
- Report ≤400 words: journeys completed (route + primary action + what is simulated), matrix rows moved to done/partial, what you left and why, any shared-file edits.
