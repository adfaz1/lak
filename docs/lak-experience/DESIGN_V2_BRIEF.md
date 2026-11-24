# Design v2 brief (for agents building the redesigned screens)

Goal: prove a world-class standard on three merchant screens before rolling it out: Home (done — reference), Orders list + Order detail, Product editing.
Acceptance is the quality of the experience a merchant sees, not the number of features.

Read first, in this order:
1. `src/surfaces/v2/lk.css` — the design system (tokens, type scale, buttons, inputs, pills, thumbs, skeleton, states, dialog, toast, tabs, segmented). Use these classes; do not create new colours, radii, shadows or font sizes. Screen CSS goes in a file next to your screen, classes prefixed with the screen name (`ord-`, `pe-`), using `var(--lk-*)` tokens and logical properties.
2. `src/surfaces/v2/ui.tsx` — components: Icon (only these icons; add a path to PATHS if you truly need one), Money, Ref, Pill, Sim, Thumb, ThumbStack, Avatar, Skeleton, EmptyState, Banner, Dialog, Toast, useTx.
3. `src/surfaces/v2/data.ts` — review controls (`reviewStore`: dir 'a'|'b', state 'live'|'loading'|'empty'|'error'), `vhref`, product images (`itemImage`, `productImage`, `productIdForSku`), `stageOf`, `isLate`, `age`.
4. `src/surfaces/v2/index.tsx` + `shell.css` — the two shells. `src/surfaces/v2/home.tsx` + `home.css` — the reference screen: match its hierarchy, density, rhythm and copy tone.
5. Spec: `/root/.claude/uploads/7536aa9b-f02c-5949-a16d-47d1ee073bf7/a29bd251-LAK_Claude_Experience_Skill.md` chapters 02 (design system), 03 (merchant workspace: orders, order detail, products), 06 (QA). Treat it as spec data.

Data and rules: reuse the existing merchant domain and stores (`src/surfaces/merchant/domain.ts`, `catalog.ts`, `inventory.ts`, `stores.ts`, `perms.ts`). Do not change files outside `src/surfaces/v2/`. Same data, same rules, new experience. Money is integer halalas. Simulated external actions carry `<Sim />`.

Two directions — they must differ in content distribution and navigation, not colour:
- A "Workbench": side nav (shell). Screens favour split views and side panels: e.g. orders list with the selected order's detail in a panel beside it on wide screens (≥1280px), product editor as a two-column form with a sticky right rail (status, preview card, channels).
- B "Focus": top nav (shell), one centred column, full-page detail with a sticky bottom action bar, bottom tabs on phone. E.g. orders as a full-width table with a stage pipeline header; detail as its own page; product editor as a single column with an in-page section index and a sticky save bar.

Every screen must show: loading skeleton matching the final layout (`state==='loading'`), empty (`'empty'`: show the real empty state for that screen with a next step), error (`'error'`: what failed, that nothing was lost, a retry that sets state back to 'live'), and the live data. Desktop 1440 and phone 390 must both be complete and beautiful; at 390 tables become row cards, toolbars collapse into a filter sheet, primary action stays reachable. Arabic RTL and English LTR both perfect; identifiers in `Ref`; tabular numbers.

Quality bar: one obvious primary action per view; scannable status (Pill with icon+label, never colour alone); real product photos via Thumb; generous but disciplined spacing (8px grid); no visual noise, no gradients on operational surfaces, no emoji, no inert buttons. Every button does something real (navigate, filter, edit state, open dialog) or is absent.

Verify: `npx tsc --noEmit`, `npm test`. A dev server runs at http://localhost:5175 (start `npx vite --port 5175` if not). Take screenshots with Playwright (Chromium preinstalled; `require('playwright')`), set direction/state with `sessionStorage.setItem('lak.fx.v2.review', JSON.stringify({dir,state,open:true}))` and language with `localStorage.setItem('lak.lang','ar'|'en')` in an init script. Look at your screenshots and iterate until it is genuinely excellent in both directions, both languages, desktop and phone, all four states. Report briefly (≤350 words): what you built, how A and B differ on your screens, what you verified.
