# LAK experience — merchant workspace preview

Interactive preview of the first vertical slice of the new LAK merchant workspace:
home priority queue → filtered orders → order detail → simulated shipment label → outcome and activity log.

**Status: prototype.** Fixture data only. No backend, no authentication, no real carrier or payment calls.
Nothing here is connected to the live LAK platform. The wordmark and colour tokens are provisional until the approved brand assets are added.

## Run

```bash
npm ci
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

## Structure

- `src/domain.ts` — types, fixtures, money in integer halalas, views, simulated label issuance (unit-tested in `domain.test.ts`)
- `src/i18n.ts` — Arabic (RTL) and English (LTR) strings
- `src/App.tsx` — shell, hash router (filters live in the URL), home, orders, order detail
- `src/styles.css` — design tokens and components
- `docs/lak-experience/` — capability matrix, decisions, known gaps, next increments
- `render.yaml` — Render static-site definition for the preview
