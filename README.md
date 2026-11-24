# LAK experience — merchant workspace preview

Interactive prototype of the six LAK surfaces: public website, platform admin, merchant workspace,
merchant storefront and checkout, App Maker, and the LAK marketplace. Arabic (RTL) and English (LTR).

**Status: prototype.** Fixture data only. No backend, no authentication, no real carrier, payment or messaging calls.
Nothing here is connected to the live LAK platform. Brand colours are sampled from the supplied logo image and are provisional.
See `docs/lak-experience/STATUS.md` for what works per surface, `DECISIONS.md` for open business decisions,
and `traceability.md` for the blueprint requirements register.

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

- `src/core/` — hash router (filters live in the URL), language, fixture stores (persisted per tab session), formatting, UI kit, tokens
- `src/surfaces/<site|admin|merchant|storefront|appmaker|market>/` — one folder per surface, each with its domain logic and tests
- `src/App.tsx` — top bar, surface switcher, direction A/B toggle for the merchant workspace
- `docs/lak-experience/` — capability matrix, decisions, known gaps, next increments
- `render.yaml` — Render static-site definition for the preview
