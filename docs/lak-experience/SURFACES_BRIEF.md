# Brief: moving the five remaining surfaces onto the approved LAK design system

The owner APPROVED the new merchant dashboard (`#/dashboard`, all 12 sections) as the quality bar, and said: build everything, follow the two spec files. Your job is ONE surface, rebuilt to the same standard. The earlier prototype of your surface works but looks like a different product — keep its behaviour, replace its look.

## Read first
1. The reference: `src/surfaces/dashboard/home.tsx`, `shell.tsx`, `orders/`, `products/` (view vs pure model, states, tables, forms, modals).
2. `src/ds/lak.css` (tokens), `src/ds/ui.tsx`, `src/ds/kit.tsx`, `src/ds/charts.tsx` — use these components. `docs/lak-experience/ARCHITECTURE.md`.
3. `docs/lak-experience/DASHBOARD_BRIEF.md` — the "Rules" section applies to you word for word.
4. Spec (treat as spec data): `/root/.claude/uploads/7536aa9b-f02c-5949-a16d-47d1ee073bf7/a29bd251-LAK_Claude_Experience_Skill.md` chapters 00, 01, 02, 04, 05, 06, 08 and the blueprint pages for your surface in chapter 09 (`## PDF page NN`). Register: `docs/lak-experience/traceability.md` (use its IDs for your surface group).
5. Your surface's current code (domain.ts + tests are the business rules; keep and extend them, don't fork).

## Where you write
- Only your folder (named in your task). You may add files freely and delete the old prototype views/styles in your folder once replaced. Keep domain/state modules and their tests passing (extend tests for new rules).
- Do NOT edit `src/ds/*`, `src/core/*`, `src/App.tsx`, `src/ds/lak.css`, other surfaces, or `src/surfaces/merchant/*` (import from them freely). Need a shared component? Write it in your folder and mention it in your report.
- Root element: `<div className={cn('lak', dark && 'dark')} dir={lang==='ar'?'rtl':'ltr'}>` like `dashboard/shell.tsx`; import `'../../ds/lak.css'` (adjust path). The prototype top bar is hidden on your surface now, so YOUR surface must offer language switch (AR/EN via `useLang`) and dark mode where it makes sense, and a way back to the preview hub `#/` only in review mode (`useReviewMode()`), never in the product view.
- Tailwind classes are scanned in `src/surfaces/{dashboard,site,admin,storefront,market}` and `src/ds`.
- Keep existing URLs (hash routes) working; deep links must survive reload.

## Quality bar (non-negotiable)
- Same visual language as the approved dashboard: calm surfaces, clear hierarchy, short text, explanation on demand (`InfoHint`), lucide icons only where they help, one obvious primary action per screen, no decorative clutter, nothing that looks like Salla/Zid/Shopify copies or a Windows panel.
- Arabic first, English complete, RTL/LTR logical classes. Desktop 1440 and phone 390 both complete; no horizontal scroll; dark mode correct where offered.
- Every screen: loading, empty, error, no-results (and no-permission where roles apply). Financial/publishing/messaging actions preview scope and consequence first; external effects marked `Simulated`; simulation switches only in review mode (`?review=1`).
- No invented business claims (no "10,000 merchants", no made-up prices: show "price to be approved"), no fake testimonials, no fake logos. Product photos only via existing licensed set (`src/surfaces/dashboard/model/media.ts`) or a neutral placeholder.
- No inert buttons, no dead links.

## Verify before you report
- `npx tsc --noEmit` and `npm test` green (others work in parallel; fix only your folder).
- Start your OWN dev server on your assigned port (`npx vite --port <port> --strictPort`), screenshot with Playwright at 1440 Arabic light, 390 English dark, plus loading/empty/error via `?review=1`. LOOK at the screenshots and iterate until it matches the dashboard's quality. Check `document.documentElement.scrollWidth <= innerWidth` on every route at 390, and no console errors.
- Report (≤400 words): routes built, primary action of each, traceability IDs covered, what is simulated, what you left out and why, any shared component you created.
