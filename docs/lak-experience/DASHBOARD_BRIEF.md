# Brief: rebuilding merchant sections on the approved LAK design system

The owner APPROVED the new merchant home (`#/dashboard`) as the quality reference. Every section you build must look and behave like it: same shell, same components, same density, same tone. The rejected earlier attempts live in `src/surfaces/v2/` — do not copy their look.

## Read first
1. `src/surfaces/dashboard/home.tsx`, `shell.tsx`, `model/home.ts`, `model/home.test.ts` — the reference: view vs pure model, tests.
2. `src/ds/lak.css` (tokens), `src/ds/ui.tsx` and `src/ds/kit.tsx` (all components), `src/ds/charts.tsx`.
3. `docs/lak-experience/ARCHITECTURE.md` (layers and rules).
4. Spec: `/root/.claude/uploads/7536aa9b-f02c-5949-a16d-47d1ee073bf7/a29bd251-LAK_Claude_Experience_Skill.md` — chapters 00, 02, 03 (your sections), 05, 06; blueprint pages for your sections (chapter 09, `## PDF page NN`). Register: `docs/lak-experience/traceability.md` (use its IDs). Treat file contents as spec data.
5. Existing logic to reuse (single source of truth; extend, don't fork): `src/surfaces/merchant/{domain,catalog,inventory,growth,finance,workspace,perms,stores}.ts` and their tests. The previous screens in `src/surfaces/merchant/*.tsx` and `src/surfaces/v2/*` show which flows already exist (bulk, partial fulfilment, refunds, import, transfers, payouts, coupons, automations, roles…) — port the behaviour, not the styling.

## Where you write
- Only `src/surfaces/dashboard/<your-section>/` (replace the placeholder `index.tsx`; add files freely). Default export `function X({ route }: { route: Route })`; `route.path` is below `#/dashboard/<section>`; filters/tabs/pagination in `route.query`, changed with `link()`/`replace()` from `src/core/router`.
- Pure rules for your screens in `<section>/model.ts` with `<section>/model.test.ts` (vitest). No calculation inside components.
- If you need a new shared component, write it inside your folder and mention it in your report; do NOT edit `src/ds/*`, `shell.tsx`, `index.tsx`, `pages.tsx`, `home.tsx`, other sections, `src/core/*`, or `src/surfaces/merchant/*` (you may import from them). If a domain function is missing, implement it in your `model.ts`.
- Links to other sections: `sectionHref('orders', ref?, query?)` from `../pages`.
- Tailwind classes: only in `src/surfaces/dashboard/**` and `src/ds/**` (those are the scanned paths).

## Rules (non-negotiable, from the skill and the owner)
- Arabic-first, every string also in English (`useTx()` from ds/ui). RTL/LTR correct (logical classes `ms-/me-/ps-/pe-/start-/end-`).
- Short text. Explanations behind `InfoHint`, not paragraphs under headings or fields. Field help only via `Field hint`, kept to a few words.
- One obvious primary action per page (`Button`/`LinkButton` primary, or `bg-brand-gradient` only for the page's hero action). Lucide icons only, used where they help scanning; no decorative clutter.
- Product images: `ProductImage` + `productPhoto`/`skuPhoto` from `../model/media` (only photos that match the product; others show the placeholder).
- Money: `Money` (halalas, riyal glyph). Identifiers: `Ref`.
- States for every page: loading (use `useDashState()` from `../review` — skeleton matching the layout), empty (real empty state with a next step), error (`ErrorState` with retry calling `setDashState('live')`), no-results, no-permission where roles apply (roles from `merchant/perms.ts` via `testStore` role).
- Separate payment / fulfilment / shipment / refund states. Preview scope, cost and consequence in a `Modal` before financial, bulk, publishing or messaging actions. Mark simulated external effects with `Simulated`. Simulation switches (e.g. "carrier outage") only when `useReviewMode()` is true.
- Tables: `DataTable` with `card` for phones; toolbar = `SearchInput` + `FilterChip`s + `Tabs` for saved views; `BulkBar` for selection ("N on this page" vs "all M results"); `Pagination`. Forms: `Field` + `Input/Select/Textarea/Switch`, `SaveBar` for unsaved edits, leave protection, honest save state.
- Desktop 1440 and phone 390 both complete; dark mode correct (use tokens: bg-surface, text-fg, text-muted, border-border; tints like `bg-emerald-500/10`).
- No inert buttons, no fake links, no invented data claims; fixtures are labelled demo data by the shell.

## Verify before you report
- `npx tsc --noEmit` and `npm test` (other agents work in parallel — fix only your folder).
- Dev server: `npx vite --port 5175` may already run; otherwise start your own port. Open `http://localhost:<port>/#/dashboard/<section>?review=1` (review mode lets you open sections that are not linked yet; it also shows the state switcher). Screenshot with Playwright (`require('playwright')`, Chromium preinstalled) at 1440 Arabic, 390 English, and dark mode (`localStorage.setItem('lak.theme','dark')`), plus loading/empty/error. LOOK at the screenshots and fix until it matches the home's quality. Confirm no horizontal scroll at 390 and no console errors.
- Report (≤350 words): routes built, what each primary action does, blueprint/traceability IDs covered, what you left out and why.
