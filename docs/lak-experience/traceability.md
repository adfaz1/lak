# LAK Build Blueprint — Requirements Traceability Register

Source: chapter 09 of `LAK_Claude_Experience_Skill.md` (text extraction of the 47-page "LAK Platform — Complete Build Blueprint" PDF). Feature names are the original English names. Counts in the source are declarations, not evidence of implementation. Where table formatting is ambiguous, the original PDF governs.

ID format: `BP-<project>-<group>-<seq>`. The `Status` column was filled by a code audit of the prototype; vocabulary: `working (simulated)`, `partial`, `display only`, `not built`, `deferred: decision needed`, `backend required`. `Note` is required wherever the implementation simplifies or changes the requirement.

## Audit summary (code read on 2026-11-24)

Counts per status. "working (simulated)" means interactive UI on browser-side fixtures with every external effect simulated — **nothing is connected to a backend; there is no backend.** Rows were checked by reading the code under `src/surfaces/`; evidence paths are relative to `src/surfaces/` unless they start with `src/` or `docs/`. `test:` cites a Vitest case by file and name.

| Project | Rows | working (simulated) | partial | display only | not built | deferred: decision needed | backend required |
|---|---|---|---|---|---|---|---|
| P01 Public Website | 24 | 9 | 8 | 0 | 0 | 7 | 0 |
| P02 Super Admin | 47 | 16 | 14 | 5 | 10 | 1 | 1 |
| P03 Merchant Dashboard | 234 | 29 | 55 | 7 | 135 | 3 | 5 |
| P04 Storefront | 60 | 18 | 13 | 1 | 28 | 0 | 0 |
| P05 App Maker | 26 | 6 | 3 | 9 | 5 | 0 | 3 |
| P06 Marketplace & ecosystem | 20 | 4 | 1 | 0 | 14 | 1 | 0 |
| Shared integrations | 50 | 1 | 2 | 0 | 1 | 0 | 46 |
| Plan matrix (entitlements) | 46 | 2 | 1 | 41 | 0 | 2 | 0 |
| Core journeys | 45 | 12 | 24 | 2 | 5 | 1 | 1 |
| Experience requirements (ch. 00–06) | 36 | 17 | 12 | 0 | 4 | 1 | 2 |
| **Blueprint feature rows (P01–P06)** | **411** | **82** | **94** | **22** | **192** | **12** | **9** |
| **All rows** | **588** | **114** | **133** | **65** | **202** | **16** | **58** |

Cross-cutting facts that limit every "working" row:

- The six surfaces keep separate fixtures. An order placed in `#/store` never reaches `#/merchant/orders`; merchant theme, store status, policies, coupons, COD limits and store languages do not change `#/store`; admin suspension does not change any store; the App Maker preview and the marketplace use their own catalogues.
- Permissions (merchant roles, admin roles) are enforced only in the browser (`src/core/store.ts:3-7`, `merchant/index.tsx:196`). All fixture data ships to the client.
- State lives in `sessionStorage` per tab and is cleared by "Reset data" (`src/core/store.ts`).
- `#/v2` (home, orders, product edit) reuses the merchant order book and catalogue logic; it adds design directions and forced loading/empty/error states, not new capabilities.


## Summary

| Project | Declared features | Sum of declared group counts | Rows registered | Gap vs declared |
|---|---|---|---|---|
| P01 Public Website — lak.sa | 27 | 26 | 24 | 3 |
| P02 Super Admin Dashboard | 47 | 47 | 47 | 0 |
| P03 Merchant Dashboard | 244 | 244 | 234 | 10 |
| P04 Merchant Storefront | 64 | 64 | 60 | 4 |
| P05 Merchant Mobile App (App Maker) | 36 | 32 | 26 | 10 |
| P06 Global Lak App & Marketplace | 49 | 21 | 20 | 29 |
| **Total** | **467** | | **411** | **56** |

### Group index

| Project | Group code | Group | Declared | Rows present | Match |
|---|---|---|---|---|---|
| P01 | HOM | Marketing Homepage | 6 | 6 | yes |
| P01 | NAV | Navigation | 3 | 3 | yes |
| P01 | PLN | Plans Page | 3 | 3 | yes |
| P01 | PAY | Payment Service Page | 1 | 1 | yes |
| P01 | MKT | Marketing Service Page | 1 | 1 | yes |
| P01 | ADS | Ads Page | 1 | 1 | yes |
| P01 | HLP | Help Center | 1 | 1 | yes |
| P01 | BLG | Blog | 1 | 1 | yes |
| P01 | SUC | Success Stories | 1 | 1 | yes |
| P01 | GDE | Marketing Guide | 1 | 1 | yes |
| P01 | LGL | Contact / Legal | 6 | 4 | NO (-2) |
| P01 | ABT | About / Company | 1 | 1 | yes |
| P02 | PLT | Platform Management | 4 | 4 | yes |
| P02 | MER | Merchant Management | 6 | 6 | yes |
| P02 | SUB | Subscription Management | 5 | 5 | yes |
| P02 | STO | Store Management | 5 | 5 | yes |
| P02 | PAY | Payment Management | 4 | 4 | yes |
| P02 | SHP | Shipping Management | 4 | 4 | yes |
| P02 | CNT | Content Management | 6 | 6 | yes |
| P02 | MON | Platform Monitoring | 5 | 5 | yes |
| P02 | RPT | Reporting | 6 | 6 | yes |
| P02 | NTF | Notification Management | 2 | 2 | yes |
| P03 | ACC | Account | 14 | 14 | yes |
| P03 | STP | Store Setup | 27 | 25 | NO (-2) |
| P03 | PMT | Payment Setup | 23 | 23 | yes |
| P03 | CHK | Checkout Settings | 15 | 14 | NO (-1) |
| P03 | PRD | Products | 27 | 26 | NO (-1) |
| P03 | INV | Inventory | 7 | 7 | yes |
| P03 | ORD | Orders | 26 | 26 | yes |
| P03 | SHP | Shipping | 13 | 13 | yes |
| P03 | CUS | Customer Mgmt | 10 | 10 | yes |
| P03 | CPN | Marketing — Coupons | 3 | 3 | yes |
| P03 | LOY | Marketing — Loyalty | 2 | 2 | yes |
| P03 | AFF | Marketing — Affiliate | 1 | 1 | yes |
| P03 | INF | Marketing — Influencer | 1 | 1 | yes |
| P03 | ADS | Marketing — Ads | 6 | 6 | yes |
| P03 | EMS | Marketing — Email/SMS | 7 | 7 | yes |
| P03 | SEO | Marketing — SEO | 4 | 4 | yes |
| P03 | MAN | Marketing — Analytics | 5 | 5 | yes |
| P03 | SOC | Marketing — Social | 2 | 2 | yes |
| P03 | REV | Reviews & Q&A | 13 | 13 | yes |
| P03 | STF | Staff Management | 5 | 5 | yes |
| P03 | ANA | Analytics | 12 | 11 | NO (-1) |
| P03 | SUP | Support (In-Dashboard) | 5 | 4 | NO (-1) |
| P03 | CHN | Sales Channels | 6 | 2 | NO (-4) |
| P03 | SET | Settings | 10 | 10 | yes |
| P04 | DIS | Discovery | 3 | 2 | NO (-1) |
| P04 | BRW | Browsing | 11 | 11 | yes |
| P04 | ACC | Account | 9 | 9 | yes |
| P04 | CRT | Cart | 6 | 4 | NO (-2) |
| P04 | CHK | Checkout | 9 | 8 | NO (-1) |
| P04 | PAY | Payment | 9 | 9 | yes |
| P04 | PST | Post-Order | 11 | 11 | yes |
| P04 | NTF | Notifications | 6 | 6 | yes |
| P05 | DSN | Design — Merchant | 6 | 3 | NO (-3) |
| P05 | PUB | Publishing — Merchant | 5 | 4 | NO (-1) |
| P05 | SYN | Sync — Merchant | 4 | 4 | yes |
| P05 | APP | App Features — Customer | 7 | 7 | yes |
| P05 | BLD | Build Infrastructure | 5 | 3 | NO (-2) |
| P05 | INA | In-App Shopping (Customer View) | 5 | 5 | yes |
| P06 | MKP | Lak Marketplace | 9 | 8 | NO (-1) |
| P06 | WHS | Lak Wholesale | 5 | 5 | yes |
| P06 | ADS | Lak Ads | 6 | 6 | yes |
| P06 | COM | Lak Community | 1 | 1 | yes |

## P01 — Public Website — lak.sa

Declared: 27 features. PDF pages 02–06. No ACCESS column in source (public marketing site). Sum of declared group counts = 26, not 27.

### P01-HOM — Marketing Homepage (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-HOM-001 | 03 | Marketing Homepage | Hero Section | AR/EN headline, CTA: Register / Demo, stats | n/a | `#/site` | partial | site/home.tsx:141-151; site/home.tsx:224-233 | AR/EN headline and Register/Demo CTAs work; the stats are deliberately shown as "—" until approved figures exist. |
| BP-P01-HOM-002 | 03 | Marketing Homepage | Feature Sections | Animated: Payments, Shipping, Design, Marketing, Analytics, App Maker | n/a | `#/site` | partial | site/home.tsx:171-199 | Not animated. Replaced by three work journeys (orders, money, stock) plus an available-vs-planned list; no Shipping, Design or Analytics sections. |
| BP-P01-HOM-003 | 03 | Marketing Homepage | Promo Banners | Marketplace promotion with App Store / Play links | n/a | `#/site` | partial | site/home.tsx:243-250 | App Store / Google Play buttons are disabled ("app not published"); the banner links to the marketplace demo instead. |
| BP-P01-HOM-004 | 03 | Marketing Homepage | Merchant Testimonials Carousel | Rotating merchant success quotes | n/a | `#/site`, `#/site/stories` | deferred: decision needed | site/home.tsx:234-238; site/stories.tsx:37-66 | No carousel or quotes: placeholder waits for written merchant consent and sourced numbers. |
| BP-P01-HOM-005 | 03 | Marketing Homepage | Sector Browsing Tiles | Fashion, Beauty, Electronics, Food, Jewelry, Home, Digital, Charity... | n/a | `#/site?sector=<id>` | working (simulated) | site/home.tsx:202-220; site/content.ts:147-154 | Eight sector chips show "needs / related tools" text and prefill the sign-up activity; they do not browse stores or products. |
| BP-P01-HOM-006 | 03 | Marketing Homepage | Live Stats Block | Active stores counter, countries supported | n/a | `#/site` | deferred: decision needed | site/home.tsx:226-233 | Active-stores and countries counters show "—" pending an approved, sourced metric. |

### P01-NAV — Navigation (declared 3)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-NAV-001 | 03 | Navigation | Primary Nav (AR/EN) | Language switcher, Login, Register CTA, main nav links | n/a | `#/site/*` | partial | site/index.tsx:78-91; src/App.tsx:78 | Language switch is in the prototype's global top bar, not the site header; "Login" opens the demo workspace (there is no login). |
| BP-P01-NAV-002 | 03 | Navigation | Footer Mega Nav | Full sitemap in footer — all sections | n/a | `#/site/*` (footer) | working (simulated) | site/index.tsx:110-170 |  |
| BP-P01-NAV-003 | 03 | Navigation | Lak Products Footer | App Maker, Theme Store, etc. | n/a | `#/site/*` (footer) | partial | site/index.tsx:127-131 | Links to Workspace, Storefront, App Maker, Marketplace demos; Theme Store is listed as "planned" with no link. |

### P01-PLN — Plans Page (declared 3)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-PLN-001 | 04 | Plans Page | Plan Comparison Table | Basic / Plus / Pro / Special — full feature matrix | n/a | `#/site/plans?plan=<id>` | working (simulated) | site/plans.tsx:87-138; site/content.ts:52-124 | Full blueprint matrix; every price shows "TBD"; commission and domain cells flagged "awaiting approval". |
| BP-P01-PLN-002 | 04 | Plans Page | Annual vs Monthly Toggle | Price toggle with savings callout | n/a | `#/site/plans?billing=annual` | deferred: decision needed | site/plans.tsx:60-69; site/plans.tsx:77 | Toggle works but there are no prices and no savings figure ("announced with prices"). |
| BP-P01-PLN-003 | 04 | Plans Page | FAQ Section | Common pricing questions and answers | n/a | `#/site/plans` | working (simulated) | site/plans.tsx:140-151 |  |

### P01-PAY — Payment Service Page (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-PAY-001 | 04 | Payment Service Page | Payment Features | Gateways, currencies, fraud detection | n/a | `#/site/payments` | working (simulated) | site/services.tsx:87-117 | Content page only; every gateway is tagged "planned". |

### P01-MKT — Marketing Service Page (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-MKT-001 | 04 | Marketing Service Page | Marketing Features | Lak Ads, influencer platform, loyalty, affiliate, SEO tools | n/a | `#/site/marketing` | working (simulated) | site/services.tsx:119-151 | Content page only; every tool is tagged "planned". |

### P01-ADS — Ads Page (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-ADS-001 | 04 | Ads Page | Ads Platform Landing | Google, TikTok, Snapchat, Meta, X campaign management | n/a | `#/site/ads` | working (simulated) | site/services.tsx:153-183 | Content page only; channels tagged "planned", attribution caveat shown. |

### P01-HLP — Help Center (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-HLP-001 | 05 | Help Center | Knowledge Base | Searchable articles, video tutorials, topic categories | n/a | `#/site/help`, `#/site/help/<id>` | partial | site/resources.tsx:44-140; test: site/domain.test.ts "matches either language and ranks title hits first" | Search and categories over 9 fixture articles; video tutorials not recorded. |

### P01-BLG — Blog (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-BLG-001 | 05 | Blog | Blog / Articles | Arabic & English posts, categories, comments, related articles | n/a | `#/site/blog`, `#/site/blog/<id>` | working (simulated) | site/resources.tsx:157-265 | Comments are session-only and shown "pending moderation (simulated)"; post copy marked draft. |

### P01-SUC — Success Stories (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-SUC-001 | 05 | Success Stories | Merchant Cases | Brand spotlights with growth metrics | n/a | `#/site/stories` | deferred: decision needed | site/stories.tsx:37-66 | Three empty slots awaiting approved stories; "nominate" goes to the contact form. |

### P01-GDE — Marketing Guide (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-GDE-001 | 05 | Marketing Guide | Store Marketing Guide | Public interactive guide for marketing a Lak store | n/a | `#/site/guide?step=<n>` | working (simulated) | site/stories.tsx:71-127 | Ticked tasks kept for the browser session only. |

### P01-LGL — Contact / Legal (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-LGL-001 | 05 | Contact / Legal | Contact Us | Phone, Email, Address, Issue report | n/a | `#/site/contact?topic=<id>` | partial | site/company.tsx:70-160 | Form validates and returns a simulated reference; phone, email and address shown "pending"; issue report is a topic in the same form. |
| BP-P01-LGL-002 | 05 | Contact / Legal | Terms of Service | Full ToS AR/EN | n/a | `#/site/legal/terms` | deferred: decision needed | site/company.tsx:164-217; site/content.ts:341-347 | Section headings with placeholder text ("this section will define…"); legal text not supplied. |
| BP-P01-LGL-003 | 05 | Contact / Legal | Privacy Policy | GDPR/PDPL compliant privacy page AR/EN | n/a | `#/site/legal/privacy` | deferred: decision needed | site/company.tsx:164-217; site/content.ts:348-354 | Placeholder text; no GDPR/PDPL compliance claim is made. |
| BP-P01-LGL-004 | 06 | Contact / Legal | Affiliate Agreement | Marketing affiliate ToS | n/a | `#/site/legal/affiliate` | deferred: decision needed | site/company.tsx:164-217; site/content.ts:355-360 | Placeholder text. |

> Count mismatch: header declares 6, 4 rows present in source (2 missing). Missing rows are not invented here.
> Note: Group description also names an external complaints subdomain and a VAT certificate; neither appears as a row (page break 05→06).

### P01-ABT — About / Company (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P01-ABT-001 | 06 | About / Company | About US Content | About Lak | n/a | `#/site/about` | partial | site/company.tsx:219-250 | Mission and principles present; founding year, HQ and CR shown as "pending". |

## P02 — Super Admin Dashboard

Declared: 47 features. PDF pages 06–11. No ACCESS column in source; project intro states all actions are admin-only and audit-logged.

### P02-PLT — Platform Management (declared 4)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P02-PLT-001 | 06 | Platform Management | Admin Login (2FA) | Secure super-admin login | Admin only | — (`#/admin` opens directly) | backend required | admin/index.tsx:56; admin/index.tsx:97-113 | No login of any kind; the role is picked from a dropdown. 2FA stated as a backend dependency. |
| BP-P02-PLT-002 | 06 | Platform Management | Super Dashboard | Platform-wide KPIs: GMV, active stores, revenue, MRR, ARR | Admin only | `#/admin` | working (simulated) | admin/screens/overview.tsx:33-42; test: admin/domain.test.ts "keeps GMV (merchant funds) out of LAK revenue and one-time fees out of MRR" | Fixture snapshot; money cards hidden for roles without overview.money. |
| BP-P02-PLT-003 | 06 | Platform Management | Monitor Platform KPIs | Real-time counters: stores, orders, payments, errors | Admin only | `#/admin` | partial | admin/screens/overview.tsx:60-73 | Static "as of" snapshot, not real-time; no payments counter. |
| BP-P02-PLT-004 | 06 | Platform Management | Audit Activity Log | Full trail of all admin actions | Admin only | `#/admin/audit?action=<id>` | working (simulated) | admin/screens/audit.tsx:9-44 | Logs actions taken in this browser session only (sessionStorage). |

### P02-MER — Merchant Management (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P02-MER-001 | 07 | Merchant Management | Review Registrations | Pending merchant applications queue | Admin only | `#/admin/kyc?status=pending` | working (simulated) | admin/screens/kyc.tsx:15-55 |  |
| BP-P02-MER-002 | 07 | Merchant Management | Approve / Reject Merchants | KYC document review and decision | Admin only | `#/admin/kyc/<id>` | working (simulated) | admin/screens/kyc.tsx:136-168; test: admin/domain.test.ts "blocks approval while a document is expired or missing, but allows asking for more info" | Reason required; approval creates an "onboarding" store, not a live one. |
| BP-P02-MER-003 | 07 | Merchant Management | Suspend / Reactivate Merchants | Temporary or permanent account actions | Admin only | `#/admin/stores/<id>` | partial | admin/screens/stores.tsx:171-176; admin/screens/stores.tsx:193-225 | Suspension is per store (temporary N days or indefinite); no merchant-account-level suspend. |
| BP-P02-MER-004 | 07 | Merchant Management | Manage Merchant Plans | Upgrade, downgrade, override plan manually | Admin only | `#/admin/stores/<id>`, `#/admin/plans?tab=changes` | working (simulated) | admin/screens/stores.tsx:251-285; admin/screens/plans.tsx:84-146; test: admin/domain.test.ts "needs approval from a different role before the store moves" | Changed: a plan change needs approval by a second role; no per-feature override; prices TBD. |
| BP-P02-MER-005 | 07 | Merchant Management | Manage Merchant Documents | Request, view, store KYC documents | Admin only | `#/admin/kyc/<id>` | partial | admin/screens/kyc.tsx:89-117 | View (role-restricted, logged) and "request more info"; no upload or storage. |
| BP-P02-MER-006 | 07 | Merchant Management | View Any Store Details | Products, orders, settings, traffic per merchant | Admin only | `#/admin/stores/<id>` | partial | admin/screens/stores.tsx:104-131; admin/screens/stores.tsx:301-326 | Counters only (GMV, orders, visits, products, staff); no product/order/settings lists. Changed: time-boxed, logged support session instead of silent access. |

### P02-SUB — Subscription Management (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P02-SUB-001 | 07 | Subscription Management | Create / Edit Subscription Plans | Define feature sets, limits, pricing per plan | Admin only | `#/admin/plans` | display only | admin/screens/plans.tsx:25-80; admin/domain.ts:83 | Read-only entitlement matrix; plans cannot be created or edited. |
| BP-P02-SUB-002 | 07 | Subscription Management | Configure Pricing (Monthly/Annual) | Regional pricing, discount rules | Admin only | `#/admin/plans` | deferred: decision needed | admin/screens/plans.tsx:30; admin/screens/plans.tsx:40 | Every price "TBD"; no regional pricing or discount rules. |
| BP-P02-SUB-003 | 07 | Subscription Management | Manage Renewals | Auto-renew rules, grace periods, reminders | Admin only | — | not built | — | Only "effective at renewal" exists for plan changes; no auto-renew, grace period or reminder rules. |
| BP-P02-SUB-004 | 07 | Subscription Management | Manage Billing & Invoices | Failed payments, retry logic, invoice history | Admin only | `#/admin/payments?kind=subscription` | not built | admin/screens/payments.tsx:51 | Subscription ledger rows show amount "TBD"; no failed-payment retry or invoice history. |
| BP-P02-SUB-005 | 07–08 | Subscription Management | Revenue Dashboard | MRR, ARR, churn rate, plan distribution | Admin only | `#/admin`, `#/admin/reports?report=subs` | partial | admin/screens/overview.tsx:37-38; admin/screens/plans.tsx:41; admin/screens/reports.tsx:37-45 | MRR, ARR, stores per plan, monthly signups/cancellations; no churn-rate figure. |

### P02-STO — Store Management (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P02-STO-001 | 08 | Store Management | View All Stores (Searchable) | Filterable list of all stores | Admin only | `#/admin/stores?q=&status=&plan=` | working (simulated) | admin/screens/stores.tsx:19-70; test: admin/domain.test.ts "searches stores in both languages and filters by plan and status" |  |
| BP-P02-STO-002 | 08 | Store Management | Suspend Store | Remove store from public (data preserved) | Admin only | `#/admin/stores/<id>` | working (simulated) | admin/screens/stores.tsx:193-225; test: admin/domain.test.ts "suspends an active store, keeping its data and recording the reason" | Storefront surface is not affected (separate fixtures). |
| BP-P02-STO-003 | 08 | Store Management | Reactivate Store | Restore suspended store | Admin only | `#/admin/stores/<id>` | working (simulated) | admin/screens/stores.tsx:174-183; test: admin/domain.test.ts "reactivates a suspended store with a reason" |  |
| BP-P02-STO-004 | 08 | Store Management | Manage Store Domains | DNS, verification, transfer management | Admin only | `#/admin/stores/<id>` | display only | admin/screens/stores.tsx:120-131 | Domain host and verification state shown; no DNS, verification or transfer actions. |
| BP-P02-STO-005 | 08 | Store Management | Monitor Store Activity | Traffic, orders, errors per store | Admin only | `#/admin/stores/<id>` | partial | admin/screens/stores.tsx:104-117 | 30-day counters and 24h errors as a fixture snapshot; no trend. |

### P02-PAY — Payment Management (declared 4)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P02-PAY-001 | 08 | Payment Management | Manage Payment Gateways | Configure available gateways per region/plan | Admin only | `#/admin/payments?tab=gateways` | display only | admin/screens/payments.tsx:98-115 | Static list ("pending contract", "manual only"); nothing configurable per region or plan. |
| BP-P02-PAY-002 | 08 | Payment Management | Monitor Transactions | Platform-wide ledger, fraud flags, chargebacks | Admin only | `#/admin/payments?kind=<kind>` | working (simulated) | admin/screens/payments.tsx:32-57 | Fixture ledger with fraud flags and merchant-vs-LAK funds; filter by kind. |
| BP-P02-PAY-003 | 08 | Payment Management | Handle Payment Issues | Disputes, chargebacks, refund escalations | Admin only | `#/admin/payments?tab=disputes` | working (simulated) | admin/screens/payments.tsx:59-96; test: admin/domain.test.ts "moves disputes only along allowed transitions" | State moves with a note; nothing submitted to a provider; refund escalations not separate. |
| BP-P02-PAY-004 | 08 | Payment Management | ZATCA Configuration | E-invoicing endpoint configuration per region | Admin only | `#/admin/payments?tab=gateways` | display only | admin/screens/payments.tsx:103 | E-invoicing row "pending contract"; no endpoint configuration. |

### P02-SHP — Shipping Management (declared 4)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P02-SHP-001 | 09 | Shipping Management | Manage Shipping Providers | Carrier rates, coverage, SLA configuration | Admin only | `#/admin/shipping` | display only | admin/screens/shipping.tsx:27-42 | Read-only carrier table (status, coverage, SLA, on-time, complaints); rates and SLA not editable. |
| BP-P02-SHP-002 | 09 | Shipping Management | Configure Global Shipping Rules | Platform defaults: weight, zone, free shipping | Admin only | — | not built | — |  |
| BP-P02-SHP-003 | 09 | Shipping Management | Monitor Deliveries | Open shipments, failed deliveries platform-wide | Admin only | `#/admin/shipping?tab=failed` | partial | admin/screens/shipping.tsx:44-83; test: admin/domain.test.ts "re-attempts failed deliveries and counts the attempt" | Failed deliveries only (re-attempt / return, simulated); open shipments not listed. |
| BP-P02-SHP-004 | 09 | Shipping Management | Shipping Quality Center | Aggregate carrier complaint management | Admin only | `#/admin/shipping` | partial | admin/screens/shipping.tsx:39 | Complaint count per carrier only; no complaint handling. |

### P02-CNT — Content Management (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P02-CNT-001 | 09 | Content Management | Manage Theme Marketplace | Approve, publish, remove themes | Admin only | `#/admin/content?state=<s>` | working (simulated) | admin/screens/content.tsx:11-77; test: admin/domain.test.ts "blocks approving a submission that fails a check and requires reasons for rejection" | Themes and apps share one moderation queue. |
| BP-P02-CNT-002 | 09 | Content Management | Manage App Marketplace | Review, approve, reject, suspend partner apps | Admin only | `#/admin/content?state=<s>` | working (simulated) | admin/screens/content.tsx:11-77 | Suspend/reinstate shows installs affected. |
| BP-P02-CNT-003 | 09 | Content Management | Manage Help Center | Create/edit articles, videos, categories | Admin only | — | not built | admin/screens/content.tsx:68 | Screen states "not built in this prototype". |
| BP-P02-CNT-004 | 09 | Content Management | Manage Static Pages | Platform terms, privacy, about | Admin only | — | not built | admin/screens/content.tsx:68 | Screen states "not built in this prototype". |
| BP-P02-CNT-005 | 09 | Content Management | Manage Influencer Directory | Approve influencers, rates, campaigns | Admin only | — | not built | admin/screens/content.tsx:68 | Screen states "not built in this prototype". |
| BP-P02-CNT-006 | 09 | Content Management | Blog & Community | Platform blog, community moderation | Admin only | — | not built | admin/screens/content.tsx:68 | Screen states "not built in this prototype". |

### P02-MON — Platform Monitoring (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P02-MON-001 | 10 | Platform Monitoring | System Health Dashboard | Uptime, response times, error rates per service | Admin only | `#/admin/health` | partial | admin/screens/health.tsx:9-30 | Fixture snapshot of services (uptime, p95, error rate); no refresh, not live. |
| BP-P02-MON-002 | 10 | Platform Monitoring | API Usage Monitor | Call volumes, rate limits, partner traffic | Admin only | `#/admin/health` | partial | admin/screens/health.tsx:28 | 24h call count per service only; no rate limits or partner traffic. |
| BP-P02-MON-003 | 10 | Platform Monitoring | Storage Usage | Object storage consumption per merchant | Admin only | — | not built | — |  |
| BP-P02-MON-004 | 10 | Platform Monitoring | Security Logs | Failed logins, suspicious IPs, threat detection | Admin only | `#/admin/health` | partial | admin/screens/health.tsx:31-45 | Fixture security events with "an IP alone is not evidence" note; no detection or filtering. |
| BP-P02-MON-005 | 10 | Platform Monitoring | Audit User Activities | Per-merchant-user full action log | Admin only | — | not built | — | Audit covers admin actions only; no per-merchant-user log. |

### P02-RPT — Reporting (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P02-RPT-001 | 10 | Reporting | Merchant Reports | Per-merchant revenue, activity, tickets | Admin only | `#/admin/reports?report=merchants` | working (simulated) | admin/screens/reports.tsx:21-28 | Per-store GMV, orders, tickets (30 days). |
| BP-P02-RPT-002 | 10 | Reporting | Revenue Reports | Platform-wide revenue by plan, region, period | Admin only | `#/admin/reports?report=revenue` | partial | admin/screens/reports.tsx:29-36 | By region and revenue type only; not by plan or chosen period. |
| BP-P02-RPT-003 | 10 | Reporting | Subscription Reports | Signups, cancellations, upgrades, downgrades | Admin only | `#/admin/reports?report=subs` | working (simulated) | admin/screens/reports.tsx:37-45 |  |
| BP-P02-RPT-004 | 10 | Reporting | Platform Sales Reports | GMV, category performance, top merchants | Admin only | `#/admin/reports?report=sales` | partial | admin/screens/reports.tsx:46-56 | GMV by category for one fixed 30-day period; top merchants only via the merchants report. |
| BP-P02-RPT-005 | 10 | Reporting | Growth Analytics | MoM growth KPIs, forecast | Admin only | — | not built | — |  |
| BP-P02-RPT-006 | 10 | Reporting | Export All Reports | CSV/Excel download for any report | Admin only | `#/admin/reports` | partial | admin/screens/reports.tsx:60-68; test: admin/domain.test.ts "writes CSV money without floats and neutralises formulas" | Real CSV file from fixtures, with scope confirmation and audit entry; no Excel. |

### P02-NTF — Notification Management (declared 2)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P02-NTF-001 | 11 | Notification Management | Platform Announcements | In-app updates/alerts to all or selected merchants | Admin only | `#/admin/announcements`, `#/admin/announcements/new` | working (simulated) | admin/screens/announcements.tsx:18-206; test: admin/domain.test.ts "validates announcements and never counts suspended stores" | Audience by all/plans/stores with recipient count; scheduling simulated, nothing sent, not shown in the merchant workspace. |
| BP-P02-NTF-002 | 11 | Notification Management | Maintenance Notifications | Scheduled downtime communications | Admin only | `#/admin/announcements/new` | working (simulated) | admin/screens/announcements.tsx:112; admin/screens/announcements.tsx:178-200 | Maintenance kind with window start/end; nothing sent. |

## P03 — Merchant Dashboard

Declared: 244 features. PDF pages 11–30. Source states 24 modules; 24 groups found. Sum of declared group counts = 244.

### P03-ACC — Account (declared 14)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-ACC-001 | 11 | Account | Register — Individual | Personal info, email/mobile, OTP verification | All plans | `#/site/start` | partial | site/start.tsx:62-140; test: site/domain.test.ts "flags each missing field" | Minimal simulated sign-up (store name, activity, mobile); no personal info, email or OTP. |
| BP-P03-ACC-002 | 11 | Account | Register — Corporate | CR number, trade license, VAT, company docs upload | All plans | — | not built | — | No entity types in sign-up. |
| BP-P03-ACC-003 | 11 | Account | Register — Sole Proprietorship | Individual CR + personal ID | All plans | — | not built | — | No entity types in sign-up. |
| BP-P03-ACC-004 | 11 | Account | Register — Charity | Charity registration + government approvals | All plans | — | not built | — | No entity types in sign-up. |
| BP-P03-ACC-005 | 11 | Account | Login / OTP | Email or mobile + password or OTP | All plans | — | not built | — | No login; `#/merchant` opens directly and the role is switched in a test panel. |
| BP-P03-ACC-006 | 12 | Account | Forgot / Change Password | SMS/email reset flow | All plans | — | not built | — |  |
| BP-P03-ACC-007 | 12 | Account | 2FA Management | Enable/disable TOTP or SMS 2FA | All plans | — | not built | — |  |
| BP-P03-ACC-008 | 12 | Account | Registered Devices | View and revoke sessions per device | All plans | — | not built | — |  |
| BP-P03-ACC-009 | 12 | Account | Sign Out All Devices | Force logout from all active sessions | All plans | — | not built | — | The remove-member dialog says sessions end (merchant/settings.tsx:186-196) but no sessions exist. |
| BP-P03-ACC-010 | 12 | Account | Activity Log | Timestamped log of all account actions | All plans | `#/merchant/settings/team` | partial | merchant/settings.tsx:180-184 | Team-change log for this session only (invites, role changes, removals), not all account actions. |
| BP-P03-ACC-011 | 12 | Account | Profile Editing | Name, email, mobile, avatar update | All plans | — | not built | — | Store details form exists (settings.tsx:82) but no personal profile or avatar. |
| BP-P03-ACC-012 | 12 | Account | Dark Mode Toggle | System/manual dark mode switch | All plans | — | not built | — | Direction B (dark navigation) is a layout option, not dark mode. |
| BP-P03-ACC-013 | 12 | Account | Notification Preferences | Per-event toggle: orders, stock, wishlist, updates | All plans | `#/merchant/settings/notifications` | partial | merchant/settings.tsx:400-422; merchant/workspace.ts:135 | Email/SMS toggles for new order, payment failed, low stock, payout, review; no wishlist or platform-update events; nothing is sent. |
| BP-P03-ACC-014 | 12 | Account | Language Preference | AR / EN admin interface language | All plans | `#/merchant/settings/language` | working (simulated) | merchant/settings.tsx:437-444 | Same switch as the global top-bar toggle. |

### P03-STP — Store Setup (declared 27)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-STP-001 | 12 | Store Setup | Create Multiple Stores | Manage independent stores from one account | Pro | — | not built | — | Single demo store; no store switcher. |
| BP-P03-STP-002 | 12 | Store Setup | Store Category Selection | Electronics, Fashion, Food, Home, Beauty, Digital, Dropshipping, Charity, etc. | All plans | `#/merchant/settings/store` | working (simulated) | merchant/settings.tsx:82-107 | Seven categories; no Dropshipping. |
| BP-P03-STP-003 | 12 | Store Setup | Theme Selection | Free and paid themes from Themes Marketplace | All plans | — | not built | — | One fixed demo theme ("هادئ"); no theme marketplace. |
| BP-P03-STP-004 | 12 | Store Setup | Logo, Favicon, Banner | Upload store branding assets | All plans | — | not built | — |  |
| BP-P03-STP-005 | 12 | Store Setup | Color & Font Customization | Brand color palette and typography | All plans | — | not built | — | Brand colours exist only for the App Maker app, not the web store. |
| BP-P03-STP-006 | 13 | Store Setup | Homepage Sections Manager | Drag-drop: banners, featured products, categories, offers, video | All plans | `#/merchant/storefront` | partial | merchant/storefront.tsx:48-75; test: merchant/workspace.test.ts "diffs, publishes as a new version and rolls back without rewriting history" | Changed: reorder by buttons (no drag), show/hide and edit headings of 7 fixed sections; publish with version and rollback. The `#/store` surface does not read it. |
| BP-P03-STP-007 | 13 | Store Setup | CSS / JS Custom Code Editor | Advanced theme code customization | Plus+ | — | not built | — |  |
| BP-P03-STP-008 | 13 | Store Setup | Store Preview Mode | Preview store before publishing | All plans | `#/merchant/storefront` | partial | merchant/storefront.tsx:85-100 | Draft preview is a block diagram in desktop/mobile frames; "Preview store" opens the fixed demo storefront, not the draft. |
| BP-P03-STP-009 | 13 | Store Setup | Publish Store | Go live toggle | All plans | `#/merchant/storefront` | partial | merchant/storefront.tsx:36-45 | Toggle with confirmation; has no effect on `#/store`. |
| BP-P03-STP-010 | 13 | Store Setup | Activate Accept Orders | Separate toggle from publish — enables ordering | All plans | `#/merchant/storefront` | partial | merchant/storefront.tsx:40 | Separate toggle as required; storefront checkout ignores it. |
| BP-P03-STP-011 | 13 | Store Setup | Order Hours | Define days/hours when store accepts orders | All plans | — | not built | — |  |
| BP-P03-STP-012 | 13 | Store Setup | Daily Order Limit | Maximum orders per day to prevent overload | All plans | — | not built | — |  |
| BP-P03-STP-013 | 13 | Store Setup | Maintenance Mode | Toggle off with custom message | All plans | `#/merchant/storefront` | partial | merchant/storefront.tsx:41 | Toggle only; no custom message; not reflected in `#/store`. |
| BP-P03-STP-014 | 13 | Store Setup | Free Subdomain | platform.com/slug | All plans | `#/merchant/settings/domains` | working (simulated) | merchant/settings.tsx:328-336 | Modelled as a path `platform.example/<slug>` as the source says; canonical format still undecided. |
| BP-P03-STP-015 | 13 | Store Setup | Connect External Domain | Point existing domain via DNS | All plans | `#/merchant/settings/domains` | working (simulated) | merchant/settings.tsx:337-361 | Shows CNAME/TXT records; verification success/failure simulated. |
| BP-P03-STP-016 | 13 | Store Setup | Register Domain via Lak | Buy domain directly in dashboard | Plus+ | — | not built | merchant/settings.tsx:362 | Screen states buying/transfer/DNS management are not built. |
| BP-P03-STP-017 | 13 | Store Setup | Transfer Domain | Migrate domain to Lak management | Plus+ | — | not built | merchant/settings.tsx:362 |  |
| BP-P03-STP-018 | 13 | Store Setup | DNS Management | Edit DNS records, verify ownership | Plus+ | — | not built | merchant/settings.tsx:362 | Required records are displayed read-only; no DNS editing. |
| BP-P03-STP-019 | 13 | Store Setup | Social Media Links | Instagram, X, TikTok, Snapchat, Facebook, LinkedIn, YouTube | All plans | — | not built | — |  |
| BP-P03-STP-020 | 13 | Store Setup | Info Pages (Rich Text) | Return Policy, Shipping Policy, Privacy, Terms | All plans | `#/merchant/settings/policies` | partial | merchant/settings.tsx:368-398 | Plain textarea, not rich text; published text does not feed `#/store/page/<id>` (storefront uses its own copy). |
| BP-P03-STP-021 | 13 | Store Setup | Landing Page Builder | Dedicated campaign landing pages | Plus+ | — | not built | — |  |
| BP-P03-STP-022 | 13 | Store Setup | Pickup Location Setup | Physical branch pickup address definition | All plans | — | not built | — | Pickup exists only as a fixed storefront shipping method (storefront/domain.ts:346). |
| BP-P03-STP-023 | 13 | Store Setup | Currency Configuration | Primary + multi-currency | All plans | `#/merchant/settings/language` | display only | merchant/settings.tsx:453 | Primary currency fixed to SAR, read-only; no multi-currency. |
| BP-P03-STP-024 | 14 | Store Setup | Language Configuration | Store front languages | All plans | `#/merchant/settings/language` | partial | merchant/settings.tsx:447-452 | AR/EN store-language choice is saved but the storefront does not read it. |
| BP-P03-STP-025 | 14 | Store Setup | Timezone & Measurement Units | Regional settings: timezone, weight unit | All plans | `#/merchant/settings/language` | working (simulated) | merchant/settings.tsx:454-457 | Saved in session; reports stay on Riyadh time regardless. |

> Count mismatch: header declares 27, 25 rows present in source (2 missing). Missing rows are not invented here.

### P03-PMT — Payment Setup (declared 23)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-PMT-001 | 14 | Payment Setup | Cash on Delivery | Enable with min/max order value limits | All plans | `#/merchant/settings/payments` | working (simulated) | merchant/settings.tsx:229-255; merchant/workspace.ts:99 | Merchant min/max are not the limits the storefront enforces (storefront uses its own fixture limit). |
| BP-P03-PMT-002 | 14 | Payment Setup | Bank Transfer Details | Manual bank account display for customers | All plans | `#/merchant/settings/payments` | partial | merchant/workspace.ts:100 | Listed as an active method; no bank details entry, and the storefront offers no bank transfer. |
| BP-P03-PMT-003 | 14 | Payment Setup | Mada | Saudi debit card gateway | Plus+ | `#/merchant/settings/payments` | partial | merchant/settings.tsx:211-227; merchant/workspace.ts:101 | Connect → pending → simulated approval; storefront checkout does not read provider state. |
| BP-P03-PMT-004 | 14 | Payment Setup | Visa / Mastercard / Amex | International card processing | Plus+ | `#/merchant/settings/payments` | partial | merchant/workspace.ts:102 | Visa/Mastercard only (no Amex); connection simulated. |
| BP-P03-PMT-005 | 14 | Payment Setup | Apple Pay | One-tap mobile payment | Plus+ | `#/merchant/settings/payments` | partial | merchant/workspace.ts:103 | Connection simulated; storefront shows Apple Pay from a device test toggle. |
| BP-P03-PMT-006 | 14 | Payment Setup | STC Pay | Saudi mobile wallet | Plus+ | `#/merchant/settings/payments` | partial | merchant/workspace.ts:104 | Fixture "action required" document upload is simulated. |
| BP-P03-PMT-007 | 14 | Payment Setup | Tabby (BNPL) | Buy Now Pay Later via Tabby | Plus+ | `#/merchant/settings/payments` | partial | merchant/workspace.ts:105 | Connection simulated. |
| BP-P03-PMT-008 | 14 | Payment Setup | Tamara (BNPL) | Buy Now Pay Later via Tamara | Plus+ | `#/merchant/settings/payments` | partial | merchant/workspace.ts:106 | Connection simulated. |
| BP-P03-PMT-009 | 14 | Payment Setup | MIS Pay | GCC mobile payment | Plus+ | — | not built | — |  |
| BP-P03-PMT-010 | 14 | Payment Setup | Madfu (BNPL) | Saudi BNPL provider | Plus+ | — | not built | — |  |
| BP-P03-PMT-011 | 14 | Payment Setup | Emkan (Installments) | Installment payment provider | Plus+ | — | not built | — |  |
| BP-P03-PMT-012 | 14 | Payment Setup | Mokafa | Loyalty redemption payment | Plus+ | — | not built | — |  |
| BP-P03-PMT-013 | 14 | Payment Setup | PayPal | International PayPal | Plus+ | — | not built | — |  |
| BP-P03-PMT-014 | 14–15 | Payment Setup | Bank Offers | Card-linked offers at checkout (e.g. 10% off with Bank X) | Pro | — | not built | — |  |
| BP-P03-PMT-015 | 15 | Payment Setup | Customer Wallet | Top-up and pay-from-wallet system | Plus+ | — | not built | — |  |
| BP-P03-PMT-016 | 15 | Payment Setup | Gift Cards | Issue and redeem store gift cards | Plus+ | — | not built | — | A "e-gift card" exists only as a digital catalogue product (merchant/catalog.ts:62). |
| BP-P03-PMT-017 | 15 | Payment Setup | Cashback Configuration | Cashback eligibility rules per order status | Plus+ | — | not built | — |  |
| BP-P03-PMT-018 | 15 | Payment Setup | Multi-Currency Checkout | Accept payment in different currencies | Plus+ | — | not built | — |  |
| BP-P03-PMT-019 | 15 | Payment Setup | ZATCA / Fatoora Integration | E-invoicing compliance | All plans | — | backend required | — | E-invoicing clearance needs a provider/ZATCA backend. |
| BP-P03-PMT-020 | 15 | Payment Setup | VAT / Tax Rules | Configure VAT rate, inclusive/exclusive pricing display | All plans | — | display only | merchant/domain.ts:172; storefront/domain.ts:6-12 | VAT fixed at 15 % inclusive and extracted for display; not configurable. |
| BP-P03-PMT-021 | 15 | Payment Setup | PCI DSS Compliance | All transactions via PCI-compliant gateway | All plans | — | backend required | — | Compliance property of a real gateway; nothing to build in UI. |
| BP-P03-PMT-022 | 15 | Payment Setup | AI Fraud Detection | Real-time risk scoring on all transactions | All plans | — | backend required | — |  |
| BP-P03-PMT-023 | 15 | Payment Setup | 3-D Secure Authentication | Card 3DS layer | All plans | `#/store/checkout` | working (simulated) | storefront/domain.ts:429-490; test: storefront/domain.test.ts "maps each simulated outcome" | Only the shopper-side 3DS "challenge" state is simulated; not a merchant setting. |

### P03-CHK — Checkout Settings (declared 15)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-CHK-001 | 15 | Checkout Settings | Guest Checkout | Orders without account registration | All plans | `#/store/checkout` | partial | storefront/pages/Checkout.tsx:233-247 | Guest checkout works on the storefront; no merchant toggle. |
| BP-P03-CHK-002 | 15 | Checkout Settings | One-Click Buy (Returning) | Prefill from most recent order | All plans | — | not built | — |  |
| BP-P03-CHK-003 | 15 | Checkout Settings | Auto-Prefill Address | Last shipping address pre-selected | All plans | `#/store/checkout` | partial | storefront/state.ts:149-157 | Signing in pre-selects the default saved address; no merchant setting. |
| BP-P03-CHK-004 | 15 | Checkout Settings | Corporate Checkout Mode | Company name, CR, VAT ID on invoice | All plans | — | not built | — |  |
| BP-P03-CHK-005 | 16 | Checkout Settings | Address via Map or Form | Choose input method for shipping address | All plans | `#/store/checkout` | partial | storefront/pages/Checkout.tsx:252-310 | Form only (Saudi city/district lists); no map and no merchant choice. |
| BP-P03-CHK-006 | 16 | Checkout Settings | Merge Guest Cart on Login | Combine guest and account carts | All plans | — | not built | — | Only one session cart exists, so there is nothing to merge. |
| BP-P03-CHK-007 | 16 | Checkout Settings | Display Donation Message | Optional charity message at checkout | All plans | — | not built | — |  |
| BP-P03-CHK-008 | 16 | Checkout Settings | Pre-Order Acknowledgement | Customer agrees to custom message before ordering | All plans | — | not built | — |  |
| BP-P03-CHK-009 | 16 | Checkout Settings | Post-Checkout Messages | Custom per-status: Pending / Under Review / Success | All plans | — | not built | — | Storefront post-checkout copy is fixed. |
| BP-P03-CHK-010 | 16 | Checkout Settings | Customer Order Notes | Allow free-text note field | All plans | — | not built | — |  |
| BP-P03-CHK-011 | 16 | Checkout Settings | Self-Cancellation Window | Set time limit for customer cancellation | All plans | — | not built | — |  |
| BP-P03-CHK-012 | 16 | Checkout Settings | Reorder / Repurchase Button | One-click reorder from order history | All plans | `#/store/track/<ref>` | partial | storefront/pages/Order.tsx:225-233 | Reorder exists for shoppers; no merchant setting. |
| BP-P03-CHK-013 | 16 | Checkout Settings | Gift Order Option | Ship to recipient with gift message | All plans | `#/store/checkout` | partial | storefront/pages/Checkout.tsx:362-368 | Gift flag + message only; no separate recipient address; no merchant setting. |
| BP-P03-CHK-014 | 16 | Checkout Settings | COD Order Limit per Customer | Prevent abuse of cash on delivery | All plans | `#/store/checkout` | partial | storefront/state.ts:140-143; test: storefront/domain.test.ts "shows Apple Pay only on supported devices and enforces COD and instalment limits" | Open-COD limit is fixed in the storefront, not set by the merchant. |

> Count mismatch: header declares 15, 14 rows present in source (1 missing). Missing rows are not invented here.

### P03-PRD — Products (declared 27)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-PRD-001 | 16 | Products | Create / Edit Product | Title, description, images, price, compare-price, SKU, barcode, weight | All plans | `#/merchant/products/new`, `#/merchant/products/<id>`, `#/v2/products/p1` | working (simulated) | merchant/product-editor.tsx:17-296; v2/product.tsx:25-320; test: merchant/catalog.test.ts "requires names, a price and a valid SKU; weight only for physical goods" | Images are placeholder "sample image" entries; no real upload. |
| BP-P03-PRD-002 | 16 | Products | Product Variants | Color, size, material... | All plans | `#/merchant/products/<id>` | working (simulated) | merchant/product-editor.tsx:201-245; test: merchant/catalog.test.ts "builds a colour × size matrix, keeps typed values and blocks duplicate option values" | Colour and size axes only; no material/custom option. |
| BP-P03-PRD-003 | 16 | Products | Product Types: Physical | Standard shippable product | All plans | `#/merchant/products/<id>` | working (simulated) | v2/product-sections.tsx:436-456 |  |
| BP-P03-PRD-004 | 17 | Products | Product Types: Digital Download | Auto-deliver download link post-purchase | All plans | `#/v2/products/p1` | partial | v2/product-sections.tsx:436; merchant/catalog.ts:6 | "Digital" type only drops weight/stock; no file and no download-link delivery. |
| BP-P03-PRD-005 | 17 | Products | Product Types: Bundle | Group multiple products into a bundle | All plans | — | not built | — |  |
| BP-P03-PRD-006 | 17 | Products | Product Types: Subscription | Recurring purchase product | Pro | — | not built | — |  |
| BP-P03-PRD-007 | 17 | Products | Category Tree Management | Hierarchical categories with images, SEO meta | All plans | `#/v2/products/p1` | partial | v2/product-sections.tsx:542-556 | Flat category select from a fixed list; no tree, images or SEO. The older editor saves every product as "General" (merchant/catalog.ts:214). |
| BP-P03-PRD-008 | 17 | Products | Brand Management | Brand logos, filter by brand | All plans | — | not built | — |  |
| BP-P03-PRD-009 | 17 | Products | Product Tags | Free-text tags for internal and customer filtering | All plans | — | not built | — |  |
| BP-P03-PRD-010 | 17 | Products | Bulk Product Editor | Mass-edit prices, quantities, status in one view | All plans | `#/merchant/products` | partial | merchant/products.tsx:85-150; test: merchant/catalog.test.ts "flags invalid cells and saves nothing until all are valid" | Price, compare-at and status only; quantities cannot be bulk-edited. |
| BP-P03-PRD-011 | 17 | Products | Import Products (CSV/Excel) | Bulk upload product catalog | All plans | `#/merchant/products/import` | working (simulated) | merchant/import.tsx:48-220; test: merchant/catalog.test.ts "finds invalid rows, in-file duplicates and conflicts with the catalogue" | Changed: no file upload — the merchant picks one of two built-in sample files. |
| BP-P03-PRD-012 | 17 | Products | Export Products (CSV) | Export full catalog | All plans | `#/merchant/products` | working (simulated) | merchant/products.tsx:65-69 | Real CSV download of the fixture catalogue. |
| BP-P03-PRD-013 | 17 | Products | Product Duplication | One-click duplicate any product | All plans | — | not built | — |  |
| BP-P03-PRD-014 | 17 | Products | 3D Product View | Interactive 3D product visualization | Pro | — | not built | — |  |
| BP-P03-PRD-015 | 17 | Products | Product Landing Pages | Dedicated per-product landing page | Plus+ | — | not built | — |  |
| BP-P03-PRD-016 | 17 | Products | SEO per Product | Custom meta title, description, URL slug | All plans | `#/merchant/products/<id>` | working (simulated) | merchant/product-editor.tsx:261-270; v2/product-sections.tsx:458-490 |  |
| BP-P03-PRD-017 | 17 | Products | Product Sorting Config | Recommended, Best Selling, Top Rated, Price asc/desc, Discount | All plans | — | not built | storefront/domain.ts:175 | Storefront sort options are fixed; merchant cannot configure them. |
| BP-P03-PRD-018 | 17 | Products | Custom Filters | Define product filter attributes | All plans | — | not built | — |  |
| BP-P03-PRD-019 | 17 | Products | Purchase Count Display | Show how many times product sold | All plans | — | not built | — |  |
| BP-P03-PRD-020 | 17 | Products | Stock Display Options | Show stock / hide / show when below X | All plans | — | not built | — |  |
| BP-P03-PRD-021 | 18 | Products | Out-of-Stock Behavior | Show sold-out last / allow browsing sold-out | All plans | — | not built | test: storefront/domain.test.ts "filters by category, size and stock, and keeps sold-out last in featured order" | Storefront always lists sold-out last; no merchant option. |
| BP-P03-PRD-022 | 18 | Products | Price Starting From | Show lowest variant price | All plans | `#/merchant/products`, `#/store/c/all` | partial | merchant/products.tsx:52-56; storefront/domain.ts:153-154 | "From" lowest price is always shown; not a merchant option. |
| BP-P03-PRD-023 | 18 | Products | Special Offer Badge | Discount badge on product card | All plans | `#/store/c/all` | partial | storefront/pages/Listing.tsx:189 | Sale badge shown when compare-at exists; no discount % and no merchant option. |
| BP-P03-PRD-024 | 18 | Products | Tax-Inclusive Pricing | Input VAT-inclusive, show pre-VAT at checkout | All plans | — | display only | merchant/domain.ts:172 | Prices are always VAT-inclusive; no input/display option. |
| BP-P03-PRD-025 | 18 | Products | Weight Display on Product Page | Show weight, and include on invoice | All plans | `#/merchant/products/<id>` | partial | v2/product-sections.tsx:438-456 | Weight captured for shipping; not shown on product page or invoice. |
| BP-P03-PRD-026 | 18 | Products | Product SKU Exclude from Inventory | Mark non-tracked SKUs | All plans | `#/v2/products/p1` | working (simulated) | v2/product-sections.tsx:255-258 | "Track quantity" switch. |

> Count mismatch: header declares 27, 26 rows present in source (1 missing). Missing rows are not invented here.
> Note: Group description names a "service" product type; no Product Types: Service row is present.

### P03-INV — Inventory (declared 7)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-INV-001 | 18 | Inventory | Create Warehouse / Branch | Multiple named warehouses | All plans | — | not built | merchant/domain.ts:15-19 | Two fixed locations (Riyadh, Jeddah); no create. |
| BP-P03-INV-002 | 18 | Inventory | Real-Time Stock Tracking | Live levels per warehouse | All plans | `#/merchant/inventory` | working (simulated) | merchant/inventory-page.tsx:78-196; test: merchant/inventory.test.ts "refuses to overwrite a level someone else changed" | On hand / reserved / available per location; not real-time. |
| BP-P03-INV-003 | 18 | Inventory | Transfer Between Inventories | Move stock between branches | All plans | `#/merchant/inventory?tab=transfers`, `#/merchant/inventory/transfers/<id>` | working (simulated) | merchant/inventory-page.tsx:230-406; test: merchant/inventory.test.ts "draft → sent → partial → closed with discrepancy, never doubling units" |  |
| BP-P03-INV-004 | 18 | Inventory | Import / Export Inventory (CSV) | Bulk stock level management | All plans | — | not built | — |  |
| BP-P03-INV-005 | 18 | Inventory | Low Stock Merchant Alerts | Notification below threshold | All plans | `#/merchant/inventory?tab=low`, `#/merchant` | working (simulated) | merchant/inventory-page.tsx:198-228; merchant/home.tsx:53 | In-app list and home queue only; no notification is sent. |
| BP-P03-INV-006 | 18 | Inventory | Customer Back-in-Stock Subscribe | Customers get notified on restock | All plans | — | not built | — |  |
| BP-P03-INV-007 | 19 | Inventory | Auto-Assign Warehouse by Customer City | Route orders to nearest warehouse | Pro | — | not built | — |  |

### P03-ORD — Orders (declared 26)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-ORD-001 | 19 | Orders | View / Filter / Search Orders | Filter by status, date, channel, carrier, tag, payment method | All plans | `#/merchant/orders?view=&q=&ch=`, `#/v2/orders` | partial | merchant/orders.tsx:97-114; v2/orders-list.tsx:133-207 | Saved views, search, channel (+ payment, fulfilment, sort in v2); no date, carrier, tag or payment-method filter. |
| BP-P03-ORD-002 | 19 | Orders | Order Detail View | Items, customer, shipping, payment, timeline | All plans | `#/merchant/orders/<ref>`, `#/v2/orders/<ref>` | working (simulated) | merchant/order.tsx:20-148; v2/order-detail.tsx:53-327 | Customer shown as name and city only (no address or contact). |
| BP-P03-ORD-003 | 19 | Orders | Confirm Order | Mark as confirmed / processing | All plans | `#/merchant/orders`, `#/v2/orders` | working (simulated) | merchant/orders.tsx:125-128; v2/orders-bulk.tsx:24-149; test: merchant/domain.test.ts "splits eligible and ineligible with reasons" | Confirm is a bulk action (v2 adds undo); no single "confirm" button in the detail. |
| BP-P03-ORD-004 | 19 | Orders | Print Invoice PDF | Brand-customized invoice with VAT (ZATCA compliant) | All plans | — | not built | — |  |
| BP-P03-ORD-005 | 19 | Orders | Print Packing Slip | Internal packing summary | All plans | `#/merchant/orders`, `#/v2/orders/<ref>` | working (simulated) | merchant/orders.tsx:126; v2/order-detail.tsx:94-97; test: merchant/domain.test.ts "counts packing slips once per successful print" | "Printing" is simulated; no document is produced. |
| BP-P03-ORD-006 | 19 | Orders | Create Shipment & Label | Generate label via connected carrier | All plans | `#/merchant/orders/<ref>` | working (simulated) | merchant/order.tsx:160-225; v2/order-fulfil.tsx:15-196; test: merchant/domain.test.ts "issues a label once and separates fulfilment from shipment state" | Two generic demo carriers with estimated prices; label reference SIM-…; carrier outage simulated. |
| BP-P03-ORD-007 | 19 | Orders | Mark as Shipped | Update status + customer notification | All plans | — | display only | merchant/domain.ts:9 | Shipment states are shown, but the merchant cannot mark an order shipped; "in transit" exists only in fixtures. |
| BP-P03-ORD-008 | 19 | Orders | Mark as Delivered | Close fulfillment loop | All plans | — | display only | merchant/domain.ts:9 | "Delivered" exists only in fixtures; no action. |
| BP-P03-ORD-009 | 19 | Orders | Track Shipment (Lak Link or Carrier) | Configurable tracking link source | All plans | — | not built | — |  |
| BP-P03-ORD-010 | 19 | Orders | Bulk Status Update | Change status for multiple orders | All plans | `#/merchant/orders`, `#/v2/orders` | working (simulated) | merchant/orders.tsx:116-218; test: merchant/domain.test.ts "reports partial success and a retry only processes failures, never repeating successes" | Only "confirm" and "print packing slips"; no free status change. |
| BP-P03-ORD-011 | 19 | Orders | Assign Order to Staff | Delegate to specific team member | Pro | — | not built | — |  |
| BP-P03-ORD-012 | 19 | Orders | Tag Orders | Internal custom labels | All plans | — | not built | — |  |
| BP-P03-ORD-013 | 19 | Orders | Add Manual Order | Dashboard-created order (phone/in-person) | All plans | — | not built | — |  |
| BP-P03-ORD-014 | 19–20 | Orders | Edit Order Post-Creation | Modify product, shipping, customer without cancelling | All plans | — | not built | — |  |
| BP-P03-ORD-015 | 20 | Orders | Process Return & Refund | Initiate return, track, issue refund | All plans | `#/merchant/orders/<ref>` | partial | merchant/order.tsx:299-382; v2/order-refund.tsx:12-140; test: merchant/domain.test.ts "stays pending until the provider confirms, and pending amounts block a duplicate" | Return = restock quantities inside the refund; no return shipment or RMA states. Shopper returns from `#/store` never reach this screen. |
| BP-P03-ORD-016 | 20 | Orders | Return & Exchange | Exchange for different product variant | All plans | — | not built | — |  |
| BP-P03-ORD-017 | 20 | Orders | Customer Self-Cancellation | Within merchant-defined window | All plans | — | not built | — |  |
| BP-P03-ORD-018 | 20 | Orders | Cashback Activation | Trigger reward on eligible order | Plus+ | — | not built | — |  |
| BP-P03-ORD-019 | 20 | Orders | Customer Order Notifications (Email/SMS) | Per-status notifications | All plans | — | not built | — |  |
| BP-P03-ORD-020 | 20 | Orders | Abandoned Cart Reminders | Auto follow-up with optional time-limited discount | All plans | `#/merchant/marketing?tab=campaigns`, `#/merchant/automations` | partial | merchant/marketing.tsx:155-230; test: merchant/growth.test.ts "every cart is either eligible or excluded with a reason" | Simulated one-off send and an automation template; no automatic time-limited discount. |
| BP-P03-ORD-021 | 20 | Orders | Smart Cart Offers | Dynamic upsell during cart / checkout | Pro | — | not built | — |  |
| BP-P03-ORD-022 | 20 | Orders | Smart Purchase Reminder | Auto re-purchase trigger at optimal time | Pro | — | not built | — |  |
| BP-P03-ORD-023 | 20 | Orders | Gift Orders | Separate delivery to gift recipient | All plans | `#/store/checkout` | partial | storefront/pages/Checkout.tsx:362-368 | Gift message only on the storefront; merchant order detail does not show it. |
| BP-P03-ORD-024 | 20 | Orders | Shipment Complaint (Quality Center) | Submit carrier complaints from dashboard | All plans | — | not built | — |  |
| BP-P03-ORD-025 | 20 | Orders | Delivery Confirmation Request | Auto-ask customer to confirm receipt | All plans | — | not built | — |  |
| BP-P03-ORD-026 | 20 | Orders | Order Scheduling | Accept bookings with date/time slot | Pro | — | not built | — |  |

### P03-SHP — Shipping (declared 13)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-SHP-001 | 21 | Shipping | Shipping Zones | Country / region / city zones | All plans | `#/merchant/settings/shipping` | working (simulated) | merchant/settings.tsx:259-313 | Zones are named city lists (free text); no country/region hierarchy. |
| BP-P03-SHP-002 | 21 | Shipping | Flat & Weight-Based Rates | Configurable per zone | All plans | `#/merchant/settings/shipping` | working (simulated) | merchant/settings.tsx:259-313 | Flat, or base + per extra kg. Storefront uses its own shipping fixtures. |
| BP-P03-SHP-003 | 21 | Shipping | Free Shipping Rules | By min spend, specific products, categories | All plans | `#/merchant/settings/shipping` | partial | merchant/settings.tsx:259-313 | "Free over" amount per zone only; not by product or category. |
| BP-P03-SHP-004 | 21 | Shipping | Connect Carriers | Connect multiple carriers based on Time & Material (Aramex, Nakel, Marsul...) | All plans | `#/merchant/orders/<ref>` | partial | merchant/order.tsx:183-190; merchant/domain.ts:61 | Two generic demo carriers picked at label time; no carrier connection screen. |
| BP-P03-SHP-005 | 21 | Shipping | Pickup Locations | In-store / branch pickup | All plans | — | not built | — |  |
| BP-P03-SHP-006 | 21 | Shipping | Express Shipping Toggle | Enable/disable express options | All plans | — | not built | — | Express exists only as a fixed storefront method (storefront/domain.ts:341-346). |
| BP-P03-SHP-007 | 21 | Shipping | COD Shipping Rules | Min/max order value for COD eligibility | All plans | `#/merchant/settings/payments` | partial | merchant/settings.tsx:229-255 | COD min/max saved; not linked to the storefront. |
| BP-P03-SHP-008 | 21 | Shipping | Carrier Auto-Status Update | Auto-update order from carrier when supported | All plans | — | backend required | — | Needs carrier webhooks. |
| BP-P03-SHP-009 | 21 | Shipping | Single Carrier Display | Show one when rates match | All plans | — | not built | — |  |
| BP-P03-SHP-010 | 21 | Shipping | Send Item Details to Carrier | Product bundle sub-items in manifest | All plans | — | backend required | — | Needs carrier manifest integration. |
| BP-P03-SHP-011 | 21 | Shipping | Restrict Shipping by Product/Category | Hide carriers for specific products | Pro | — | not built | — |  |
| BP-P03-SHP-012 | 21 | Shipping | Global Shipping Fleet | Lak-negotiated discounted carrier rates | Plus+ | — | deferred: decision needed | site/content.ts:44 | Depends on carrier contracts not yet approved. |
| BP-P03-SHP-013 | 21 | Shipping | Lak Shipping Labels | Print labels + Quality Center for complaints | Plus+ | — | not built | — |  |

> Note: Group header on page 20; all rows on page 21.

### P03-CUS — Customer Mgmt (declared 10)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-CUS-001 | 22 | Customer Mgmt | View / Filter Customers | By name, email, mobile, location, segment | All plans | `#/merchant/customers?q=&seg=` | partial | merchant/customers.tsx:25-64 | Search by name, id or city and filter by segment; no email/mobile search. |
| BP-P03-CUS-002 | 22 | Customer Mgmt | Customer Profile | Order history, LTV, reviews, addresses, wallet | All plans | `#/merchant/customers/<id>` | partial | merchant/customers.tsx:66-165 | Orders, spend, internal notes, messages, consent, segments; no addresses, reviews or wallet. |
| BP-P03-CUS-003 | 22 | Customer Mgmt | Block Customer | Prevent ordering by suspicious accounts | All plans | — | not built | — |  |
| BP-P03-CUS-004 | 22 | Customer Mgmt | Segment Customers | Group for personalized discounts / payment options | Pro | `#/merchant/customers?seg=<id>` | partial | merchant/customers.tsx:17; merchant/customers.tsx:51-53 | Four fixed rule segments for filtering only; not usable for discounts or payment options. |
| BP-P03-CUS-005 | 22 | Customer Mgmt | Flag Non-Serious Customer | Cross-store Lak-wide warning system | All plans | — | deferred: decision needed | merchant/customers.tsx:110-121 | Cross-store flag needs an approved anti-abuse policy (skill ch. 08 #8); only in-store internal notes exist. |
| BP-P03-CUS-006 | 22 | Customer Mgmt | Import / Export Customers | Bulk CSV operations | All plans | — | not built | — |  |
| BP-P03-CUS-007 | 22 | Customer Mgmt | Unified Account (Cross-Store) | One Lak account works across all stores | All plans | — | deferred: decision needed | — | Cross-store identity needs a data-sharing decision and a backend. |
| BP-P03-CUS-008 | 22 | Customer Mgmt | View Reviews & Respond | Approve, hide, reply to reviews | All plans | — | not built | — |  |
| BP-P03-CUS-009 | 22 | Customer Mgmt | View Q&A & Respond | Answer customer questions on product pages | All plans | — | not built | — |  |
| BP-P03-CUS-010 | 22 | Customer Mgmt | Customer Wallet View | Balance, top-up history, transactions | All plans | — | not built | — |  |

> Note: Group header on page 21; all rows on page 22.

### P03-CPN — Marketing — Coupons (declared 3)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-CPN-001 | 22 | Marketing — Coupons | Create Coupon Codes | %, fixed, free shipping, BOGO, min-spend conditions | All plans | `#/merchant/marketing?create=1` | partial | merchant/marketing.tsx:95-153; merchant/growth.ts:7; test: merchant/growth.test.ts "validates codes, values, limits and dates" | Percent, fixed and free shipping with min spend and limits; no BOGO. The storefront accepts its own coupon list, not these. |
| BP-P03-CPN-002 | 22 | Marketing — Coupons | Coupon Management | List, activate, deactivate, track usage stats | All plans | `#/merchant/marketing` | working (simulated) | merchant/marketing.tsx:48-93; test: merchant/growth.test.ts "lists competing coupons of the same kind in the same window" | Usage counts are fixture numbers. |
| BP-P03-CPN-003 | 22 | Marketing — Coupons | Bulk / Quantity Pricing | Tiered pricing for volume orders (unit price decreases as quantity rises) | Pro | — | not built | — |  |

### P03-LOY — Marketing — Loyalty (declared 2)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-LOY-001 | 23 | Marketing — Loyalty | Loyalty Points Program | Points earn & redeem rules | Plus+ | — | not built | — |  |
| BP-P03-LOY-002 | 23 | Marketing — Loyalty | Cashback Program | % cashback to store wallet on eligible orders | Plus+ | — | not built | — |  |

### P03-AFF — Marketing — Affiliate (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-AFF-001 | 23 | Marketing — Affiliate | Affiliate Program | Referral links, commissions, payout management | Pro | — | not built | — |  |

### P03-INF — Marketing — Influencer (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-INF-001 | 23 | Marketing — Influencer | Influencer Discovery & Campaigns | Search, contract, execute, track, pay influencers | Pro | — | not built | — |  |

### P03-ADS — Marketing — Ads (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-ADS-001 | 24 | Marketing — Ads | Lak Ads — Google / YouTube | Managed PPC (Pay-Per-Click) from Lak dashboard | Plus+ | — | not built | — | Only the public `#/site/ads` copy page exists. |
| BP-P03-ADS-002 | 24 | Marketing — Ads | Lak Ads — TikTok | TikTok for Business campaigns | Plus+ | — | not built | — |  |
| BP-P03-ADS-003 | 24 | Marketing — Ads | Lak Ads — Snapchat | Snapchat Business campaigns | Plus+ | — | not built | — |  |
| BP-P03-ADS-004 | 24 | Marketing — Ads | Lak Ads — Meta / Instagram | Meta Business campaigns + pixel | Plus+ | — | not built | — |  |
| BP-P03-ADS-005 | 24 | Marketing — Ads | Lak Ads — X (Twitter) | X Ads campaigns | Plus+ | — | not built | — |  |
| BP-P03-ADS-006 | 24 | Marketing — Ads | UTM Link Generator | Create/track UTM campaign links | All plans | — | not built | — |  |

> Note: Group header on page 23; all rows on page 24.

### P03-EMS — Marketing — Email/SMS (declared 7)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-EMS-001 | 24 | Marketing — Email/SMS | Marketing Campaigns (Broadcast) | Send email/SMS to customer segments | Plus+ | `#/merchant/marketing?tab=campaigns` | partial | merchant/marketing.tsx:155-230 | Only an abandoned-cart broadcast (audience, consent exclusions, cost estimate, cancellable simulated send); no free segment broadcast. |
| BP-P03-EMS-002 | 24 | Marketing — Email/SMS | Welcome Message Automation | Auto-send welcome to new subscribers | All plans | — | not built | merchant/growth.ts:118-122 | Templates are abandoned cart, low stock and late order; no welcome flow. |
| BP-P03-EMS-003 | 24 | Marketing — Email/SMS | Abandoned Cart Email / SMS | Auto follow-up with optional discount | All plans | `#/merchant/automations/<id>`, `#/merchant/marketing?tab=campaigns` | working (simulated) | merchant/automations.tsx:96-215; test: merchant/growth.test.ts "dry-run reports act/skip with reasons, without side effects" | Must dry-run before activation; nothing is sent. |
| BP-P03-EMS-004 | 24 | Marketing — Email/SMS | Wishlist Price Drop Alert | Notify on price reduction | All plans | — | not built | — |  |
| BP-P03-EMS-005 | 24 | Marketing — Email/SMS | Back-in-Stock Alert | Notify wishlist subscribers on restock | All plans | — | not built | — |  |
| BP-P03-EMS-006 | 24 | Marketing — Email/SMS | Wishlist Stock Low Alert | Alert when low on wishlist item | All plans | — | not built | — |  |
| BP-P03-EMS-007 | 24–25 | Marketing — Email/SMS | Wishlist 14-Day Reminder | Remind customers of saved items | All plans | — | not built | — |  |

### P03-SEO — Marketing — SEO (declared 4)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-SEO-001 | 25 | Marketing — SEO | Homepage & Global SEO | Meta title/desc, robots.txt, sitemap.xml | All plans | — | not built | — |  |
| BP-P03-SEO-002 | 25 | Marketing — SEO | Per-Page SEO (Products/Categories) | Custom meta, canonical, URL slug per page | All plans | `#/merchant/products/<id>` | partial | merchant/product-editor.tsx:261-270 | Products only (title, description, slug); no categories, no canonical. |
| BP-P03-SEO-003 | 25 | Marketing — SEO | Blog Module | Publish SEO articles, categories, tags, comments | All plans | — | not built | — |  |
| BP-P03-SEO-004 | 25 | Marketing — SEO | llms.txt (AI-friendly content) | Machine-readable brand page | All plans | — | not built | — |  |

### P03-MAN — Marketing — Analytics (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-MAN-001 | 25 | Marketing — Analytics | Google Analytics 4 | GA4 setup and event tracking | All plans | `#/merchant/apps/ga` | partial | merchant/workspace.ts:225; merchant/apps.tsx:55-120 | Sample app with simulated connect/disconnect; no events are tracked. |
| BP-P03-MAN-002 | 25 | Marketing — Analytics | Facebook Pixel | Conversion tracking for Meta ads | All plans | — | not built | — |  |
| BP-P03-MAN-003 | 25 | Marketing — Analytics | TikTok Pixel | Conversion tracking for TikTok ads | All plans | — | not built | — |  |
| BP-P03-MAN-004 | 25 | Marketing — Analytics | Google Tag Manager | GTM container injection | All plans | — | not built | — |  |
| BP-P03-MAN-005 | 25 | Marketing — Analytics | Hotjar | Heatmaps and session recording | All plans | — | not built | — |  |

### P03-SOC — Marketing — Social (declared 2)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-SOC-001 | 26 | Marketing — Social | WhatsApp Business API | Auto order confirmations via WhatsApp | All plans | `#/merchant/apps/wa` | partial | merchant/workspace.ts:224; merchant/apps.tsx:55-120 | Sample app with simulated connect; no messages are sent. |
| BP-P03-SOC-002 | 26 | Marketing — Social | Social Media Links in Store | Follow icons in storefront | All plans | — | not built | — |  |

> Note: Group header on page 25; rows on page 26.

### P03-REV — Reviews & Q&A (declared 13)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-REV-001 | 26 | Reviews & Q&A | Enable Product / Store / Shipping Reviews | Per-type review toggle | All plans | — | not built | — |  |
| BP-P03-REV-002 | 26 | Reviews & Q&A | Auto-Publish or Moderate Reviews | Skip or require approval | All plans | — | not built | — |  |
| BP-P03-REV-003 | 26 | Reviews & Q&A | Hide Customer Name (Masking) | M* A**** name masking | All plans | — | not built | — |  |
| BP-P03-REV-004 | 26 | Reviews & Q&A | Photo Reviews | Image attachment in reviews | All plans | — | not built | — |  |
| BP-P03-REV-005 | 26 | Reviews & Q&A | Review Likes | Helpful/not helpful vote | All plans | — | not built | — |  |
| BP-P03-REV-006 | 26 | Reviews & Q&A | Customer Edit / Delete Review | Post-submission editing | All plans | — | not built | — |  |
| BP-P03-REV-007 | 26 | Reviews & Q&A | Thank You Message on Review | Custom post-review message | All plans | — | not built | — |  |
| BP-P03-REV-008 | 26 | Reviews & Q&A | Product Q&A | Customer questions on product pages | All plans | — | not built | — |  |
| BP-P03-REV-009 | 26 | Reviews & Q&A | Info Page Q&A | Questions on static info pages | All plans | — | not built | — |  |
| BP-P03-REV-010 | 26 | Reviews & Q&A | Auto-Publish Questions | No moderation for questions | All plans | — | not built | — |  |
| BP-P03-REV-011 | 27 | Reviews & Q&A | Restrict Guest Questions | Only registered users post questions | All plans | — | not built | — |  |
| BP-P03-REV-012 | 27 | Reviews & Q&A | Show Rating on Category Page | Aggregated rating on category cards | All plans | — | not built | — |  |
| BP-P03-REV-013 | 27 | Reviews & Q&A | Share Review Request Link | Merchant sends post-purchase link | All plans | — | not built | — |  |

### P03-STF — Staff Management (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-STF-001 | 27 | Staff Management | Create Staff Accounts | Add team members by email/mobile | All plans | `#/merchant/settings/team` | working (simulated) | merchant/settings.tsx:109-163 | Invite is simulated (no email); seat limit per plan enforced. |
| BP-P03-STF-002 | 27 | Staff Management | Assign Staff Roles | Predefined or custom roles | Pro | `#/merchant/settings/team` | partial | merchant/settings.tsx:139-150; merchant/perms.ts:5-6 | Four predefined roles; no custom roles. |
| BP-P03-STF-003 | 27 | Staff Management | Granular RBAC Permissions | Per-module access control | Pro | `#/merchant/settings/team` | partial | merchant/settings.tsx:166-178; test: merchant/workspace.test.ts "restricts pages and actions by role" | Fixed role matrix enforced in the browser only; not configurable per module. |
| BP-P03-STF-004 | 27 | Staff Management | Staff Activity Log | Audit trail per team member | Pro | `#/merchant/settings/team` | partial | merchant/settings.tsx:180-184 | Team-membership changes only, not each member's actions. |
| BP-P03-STF-005 | 27 | Staff Management | Assign Orders to Staff | Order-level delegation | Pro | — | not built | — |  |

### P03-ANA — Analytics (declared 12)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-ANA-001 | 27 | Analytics | Performance Dashboard | Gross/Net Sales, Discounts, COGS, Shipping, Fees, Net Profit | All plans | `#/merchant/analytics?period=&cmp=&metric=&view=` | partial | merchant/analytics.tsx:14-107; test: merchant/growth.test.ts "compares equal complete periods" | Net sales, orders, AOV, conversion with chart/table; no discounts, COGS, fees or net-profit breakdown. |
| BP-P03-ANA-002 | 27–28 | Analytics | Sales Dashboard | Orders, AOV, Repeat Rate, Return Rate, Sales by Channel | Pro | `#/merchant/analytics` | partial | merchant/analytics.tsx:14-60 | Orders and AOV only; no repeat/return rate or sales by channel. |
| BP-P03-ANA-003 | 28 | Analytics | Products Reports | Top selling, most profitable, abandoned, wishlist, returned | Pro | — | not built | — |  |
| BP-P03-ANA-004 | 28 | Analytics | Customers Reports | New vs returning, top spenders, satisfaction score, age/gender | Pro | — | not built | — |  |
| BP-P03-ANA-005 | 28 | Analytics | Visits Analytics | Traffic sources, keywords, top cities, browser, most visited pages | All plans | — | not built | — |  |
| BP-P03-ANA-006 | 28 | Analytics | Payments Analytics | Gateway breakdown, suspicious rate, chargeback rate | All plans | — | not built | — |  |
| BP-P03-ANA-007 | 28 | Analytics | Shipping Analytics | Avg delivery time, carrier performance, top cities | Pro | — | not built | — |  |
| BP-P03-ANA-008 | 28 | Analytics | Inventory Analytics | Stock availability, back-in-stock requests, wishlist adds | All plans | — | not built | — |  |
| BP-P03-ANA-009 | 28 | Analytics | Coupons Reports | Usage, revenue impact per coupon | Pro | — | not built | — |  |
| BP-P03-ANA-010 | 28 | Analytics | Abandoned Cart Reports | Lost revenue, recovered carts, most abandoned products | Pro | — | not built | — |  |
| BP-P03-ANA-011 | 28 | Analytics | Export All Reports (CSV/Excel) | Download any dataset | Pro | — | not built | — | Only finance transactions/payouts export CSV (finance-page.tsx:135, 182). |

> Count mismatch: header declares 12, 11 rows present in source (1 missing). Missing rows are not invented here.
> Note: Group description says twelve dashboards "topped with AI-powered smart insights"; no smart-insights row is present.

### P03-SUP — Support (In-Dashboard) (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-SUP-001 | 28 | Support (In-Dashboard) | Live Chat with Support | Real-time Lak team support | All plans | `#/merchant/help` | partial | merchant/help.tsx:52-66 | Ticket form with simulated reference; no live chat or support team. |
| BP-P03-SUP-002 | 28 | Support (In-Dashboard) | Global Search | Search orders, products, customers across dashboard | All plans | `#/merchant/*` (Ctrl/Cmd+K) | working (simulated) | merchant/palette.tsx:18-90; merchant/index.tsx:90-97 | Orders, products, customers, settings and commands, filtered by role. |
| BP-P03-SUP-003 | 28–29 | Support (In-Dashboard) | Contextual Help Articles | Per-page embedded help links | All plans | `#/merchant/help?q=` | partial | merchant/help.tsx:10-45 | Searchable article list linking to the related page; not embedded per page. |
| BP-P03-SUP-004 | 29 | Support (In-Dashboard) | Video Tutorials | Embedded how-to videos | All plans | — | not built | — |  |

> Count mismatch: header declares 5, 4 rows present in source (1 missing). Missing rows are not invented here.
> Note: Group description names an AI assistant for natural-language store management; no such row is present.

### P03-CHN — Sales Channels (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-CHN-001 | 29 | Sales Channels | Lak Marketplace (Auto) | Products auto-listed — no setup needed | All plans | `#/market/seller` | partial | market/index.tsx:837-932; test: market/domain.test.ts "allows submission only for eligible items" | Changed: each item is submitted for eligibility review, not listed automatically (rules pending approval). |
| BP-P03-CHN-002 | 29 | Sales Channels | App Maker (iOS & Android) | Build and publish branded mobile app (add-on) | Plus+ | `#/appmaker` | partial | merchant/index.tsx:135 | Link from the merchant nav to the separate App Maker surface (see P05). |

> Count mismatch: header declares 6, 2 rows present in source (4 missing). Missing rows are not invented here.
> Note: Group description also names the Lak Wholesale B2B channel and TikTok/Snapchat catalog sync; no rows are present for them.

### P03-SET — Settings (declared 10)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P03-SET-001 | 29 | Settings | Product Settings | Display, inventory, wishlist, notification behavior settings | All plans | — | not built | — |  |
| BP-P03-SET-002 | 29 | Settings | Order Settings | Post-checkout messages, limits, hours, cancellation | All plans | — | not built | — |  |
| BP-P03-SET-003 | 29 | Settings | Shipping Settings | COD rules, carrier auto-update, warehouse routing | All plans | `#/merchant/settings/shipping` | partial | merchant/settings.tsx:259-313 | Zones and rates only; no carrier auto-update or warehouse routing. |
| BP-P03-SET-004 | 29 | Settings | Customer Settings | Registration optional, address method, cart merge | All plans | — | not built | — |  |
| BP-P03-SET-005 | 29 | Settings | Marketing Settings | Coupon rules, welcome message, free product criteria | All plans | — | not built | — |  |
| BP-P03-SET-006 | 29 | Settings | Review Settings | All review and Q&A configuration options | All plans | — | not built | — |  |
| BP-P03-SET-007 | 29 | Settings | Notification Settings | Per-event merchant notification toggles | All plans | `#/merchant/settings/notifications` | working (simulated) | merchant/settings.tsx:400-422 | Five events × email/SMS; nothing sent. |
| BP-P03-SET-008 | 29 | Settings | Tax / VAT Settings | Rate, inclusive/exclusive, ZATCA configuration | All plans | — | display only | merchant/domain.ts:172 | VAT fixed at 15 % inclusive; no settings page. |
| BP-P03-SET-009 | 30 | Settings | Currency & Exchange Rates | Primary + secondary, auto/manual rates | All plans | `#/merchant/settings/language` | display only | merchant/settings.tsx:453 | SAR only; no secondary currency or rates. |
| BP-P03-SET-010 | 30 | Settings | Balance & Billing | Subscription payment method, invoices, billing details | All plans | `#/merchant/finance?tab=billing` | partial | merchant/finance-page.tsx:195-251; test: merchant/finance.test.ts "derives entitlements and differences from one registry" | Plan, entitlements and a plan-change preview; price "to be approved"; masked fixture card; no invoices. |

## P04 — Merchant Storefront

Declared: 64 features. PDF pages 30–35. No ACCESS column in source; availability follows the merchant's plan (see P03 gates).

### P04-DIS — Discovery (declared 3)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P04-DIS-001 | 30 | Discovery | Browse Lak Marketplace | Browse products across multiple stores | not stated | `#/market` | working (simulated) | market/index.tsx:173-272 | Fixture catalogue, separate from the merchant's and the storefront's products. |
| BP-P04-DIS-002 | 30 | Discovery | Direct Store URL | Custom domain | not stated | `#/store` | partial | storefront/index.tsx:18-36 | The store is reachable at a hash route; custom domain exists only as a simulated merchant setting. |

> Count mismatch: header declares 3, 2 rows present in source (1 missing). Missing rows are not invented here.
> Note: Group description names a third path (social and ad traffic); no row is present for it.

### P04-BRW — Browsing (declared 11)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P04-BRW-001 | 30 | Browsing | Homepage | Themed: banners, featured products, categories, offers, video | not stated | `#/store` | working (simulated) | storefront/pages/Home.tsx:6-90 | Fixed fixture homepage; does not follow the merchant's theme sections. |
| BP-P04-BRW-002 | 30 | Browsing | Category Pages | Filters, sort, aggregated ratings | not stated | `#/store/c/<cat>?sort=&size=&color=` | partial | storefront/pages/Listing.tsx:34-168; test: storefront/domain.test.ts "filters by category, size and stock, and keeps sold-out last in featured order" | Filters and sort work; no aggregated ratings (no reviews). |
| BP-P04-BRW-003 | 30 | Browsing | Brand Pages | Products filtered by brand | not stated | — | not built | — |  |
| BP-P04-BRW-004 | 31 | Browsing | Product Search | Full-text search, autocomplete, filters | not stated | `#/store/search?q=` | partial | storefront/index.tsx:116-121; test: storefront/domain.test.ts "searches Arabic without caring about hamza or ta marbuta" | Full-text and filters; no autocomplete. |
| BP-P04-BRW-005 | 31 | Browsing | Product Detail Page | Image carousel, description, variants, price, stock, reviews, Q&A, shipping ETA | not stated | `#/store/p/<id>` | partial | storefront/pages/Product.tsx:11-198 | Images, variants, price, stock level, delivery estimate; no reviews or Q&A. |
| BP-P04-BRW-006 | 31 | Browsing | 3D Product View | Interactive 360 model (Pro merchant stores) | Pro (per row text) | — | not built | — |  |
| BP-P04-BRW-007 | 31 | Browsing | Related Products Section | 'You may also like' recommendations | not stated | `#/store/p/<id>` | working (simulated) | storefront/pages/Product.tsx:48 | Same-category products, not personalised. |
| BP-P04-BRW-008 | 31 | Browsing | Wishlist Add / Remove | Save for later, get alerts | not stated | `#/store/p/<id>`, `#/store/account?tab=wishlist` | partial | storefront/pages/Product.tsx:153; storefront/pages/Listing.tsx:195 | Save/remove works; no alerts. |
| BP-P04-BRW-009 | 31 | Browsing | Product Q&A | Post and read questions/answers | not stated | — | not built | — |  |
| BP-P04-BRW-010 | 31 | Browsing | Info Pages | Return policy, shipping policy, privacy, terms | not stated | `#/store/page/<id>` | working (simulated) | storefront/pages/Policy.tsx:29-45 | Fixture text, not the merchant's policy editor. |
| BP-P04-BRW-011 | 31 | Browsing | Blog Articles | Merchant-published content | not stated | — | not built | — |  |

### P04-ACC — Account (declared 9)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P04-ACC-001 | 31 | Account | Register (Email/Mobile + OTP) | Account creation with verification | not stated | — | not built | — |  |
| BP-P04-ACC-002 | 31 | Account | Login (Password or OTP) | Flexible login options | not stated | `#/store/account`, `#/store/checkout` | partial | storefront/state.ts:149-157 | Changed: one-click simulated sign-in as a fixture shopper; no password or OTP. |
| BP-P04-ACC-003 | 31 | Account | Profile Edit | Name, email, mobile, avatar | not stated | — | not built | — |  |
| BP-P04-ACC-004 | 31 | Account | Address Book (Multiple Addresses) | Map or form entry, multiple saved addresses | not stated | `#/store/account?tab=addresses` | working (simulated) | storefront/pages/Account.tsx:72-168 | Form only (no map); Saudi address fields. |
| BP-P04-ACC-005 | 31 | Account | Order History & Status | All past orders with re-order button | not stated | `#/store/account` | partial | storefront/pages/Account.tsx:48-70 | Order list; the reorder button is on the tracking page. |
| BP-P04-ACC-006 | 31 | Account | Wishlist Management | View, remove, receive alerts | not stated | `#/store/account?tab=wishlist` | partial | storefront/pages/Account.tsx:169-179 | View/remove; no alerts. |
| BP-P04-ACC-007 | 31 | Account | Wallet / Balance | View balance, top-up, transaction history | not stated | — | not built | — |  |
| BP-P04-ACC-008 | 32 | Account | Loyalty Points View | Earned points, redemption options | not stated | — | not built | — |  |
| BP-P04-ACC-009 | 32 | Account | Notifications Inbox | All email/SMS triggered events | not stated | — | not built | — |  |

### P04-CRT — Cart (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P04-CRT-001 | 32 | Cart | Add to Cart | Variant selection + quantity add | not stated | `#/store/p/<id>` | working (simulated) | storefront/pages/Product.tsx:60-66; test: storefront/domain.test.ts "adds, merges, caps at stock and removes" |  |
| BP-P04-CRT-002 | 32 | Cart | Modify Cart | Quantity adjust, remove items | not stated | `#/store/cart` | working (simulated) | storefront/pages/Cart.tsx:94-130; test: storefront/domain.test.ts "flags lines whose stock changed after adding" |  |
| BP-P04-CRT-003 | 32 | Cart | Apply Coupon Code | Discount code field | not stated | `#/store/cart` | working (simulated) | storefront/pages/Cart.tsx:32-56; test: storefront/domain.test.ts "explains each refusal with its own reason" | Storefront coupons are its own fixture list, not the merchant's. |
| BP-P04-CRT-004 | 32 | Cart | Gift Wrap / Message | Mark as gift, add message | not stated | `#/store/checkout` | partial | storefront/pages/Checkout.tsx:362-368 | Gift flag + message at checkout (not cart); no gift wrap. |

> Count mismatch: header declares 6, 4 rows present in source (2 missing). Missing rows are not invented here.
> Note: Group description names smart upsell offers and an estimated shipping preview; no rows are present for them.

### P04-CHK — Checkout (declared 9)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P04-CHK-001 | 32 | Checkout | Guest Checkout (No Account) | Place order without registering | not stated | `#/store/checkout` | working (simulated) | storefront/pages/Checkout.tsx:233-247 |  |
| BP-P04-CHK-002 | 32 | Checkout | Shipping Address (Map or Form) | Enter via map pin or manual form | not stated | `#/store/checkout` | partial | storefront/pages/Checkout.tsx:252-310; test: storefront/domain.test.ts "requires Saudi address fields and keeps national address optional" | Form only; no map pin; Saudi addresses only. |
| BP-P04-CHK-003 | 32 | Checkout | Select Shipping Method | Available carriers and rates | not stated | `#/store/checkout` | working (simulated) | storefront/pages/Checkout.tsx:314-340; storefront/domain.ts:341-346 | Three fixed methods (standard, express, pickup), not carriers. |
| BP-P04-CHK-004 | 32 | Checkout | Select Payment Method | Online / COD / Wallet / BNPL / Gift Card | not stated | `#/store/checkout` | partial | storefront/pages/Checkout.tsx:145-150 | Card/mada, Apple Pay (device toggle), instalments, COD; no wallet or gift card. |
| BP-P04-CHK-005 | 32 | Checkout | One-Click Buy (Returning Customer) | Prefill from last order | not stated | — | not built | — |  |
| BP-P04-CHK-006 | 33 | Checkout | Review Order Summary | Items, subtotal, VAT, discount, shipping, total | not stated | `#/store/checkout` | working (simulated) | storefront/pages/Cart.tsx:7-20; test: storefront/domain.test.ts "breaks down a VAT-inclusive order" |  |
| BP-P04-CHK-007 | 33 | Checkout | Corporate Checkout | Company name, CR, VAT ID for B2B invoice | not stated | — | not built | — |  |
| BP-P04-CHK-008 | 33 | Checkout | Pre-Order Acknowledgement | Custom merchant message agreement | not stated | — | not built | — |  |

> Count mismatch: header declares 9, 8 rows present in source (1 missing). Missing rows are not invented here.
> Note: Group description mentions "booking variations"; no booking row is present.

### P04-PAY — Payment (declared 9)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P04-PAY-001 | 33 | Payment | Complete Online Payment | Secure gateway redirect or embedded form | not stated | `#/store/checkout`, `#/store/order/<ref>` | working (simulated) | storefront/pages/Checkout.tsx:60-80; test: storefront/domain.test.ts "resolves a timeout only through verification, and allows a retry after a decline" | Outcome (success, decline, 3DS, timeout) is chosen in a test panel; no gateway. |
| BP-P04-PAY-002 | 33 | Payment | COD Confirmation | Instant order confirmation, pay on delivery | not stated | `#/store/checkout` | working (simulated) | storefront/pages/Checkout.tsx:63-64; test: storefront/domain.test.ts "keeps payment, fulfilment and shipment separate and collects COD on delivery" |  |
| BP-P04-PAY-003 | 33 | Payment | Bank Transfer + Slip Upload | Upload transfer confirmation | not stated | — | not built | — |  |
| BP-P04-PAY-004 | 33 | Payment | Wallet Payment | Deduct from store wallet balance | not stated | — | not built | — |  |
| BP-P04-PAY-005 | 33 | Payment | BNPL (Tabby or Tamara) | Select instalment plan at checkout | not stated | `#/store/checkout` | partial | storefront/pages/Checkout.tsx:148 | One generic "instalments" option (simulated), not Tabby/Tamara plans. |
| BP-P04-PAY-006 | 33 | Payment | Gift Card Redemption | Apply gift card at checkout | not stated | — | not built | — |  |
| BP-P04-PAY-007 | 33 | Payment | Order Confirmation (Email + SMS) | Instant post-checkout notification | not stated | `#/store/order/<ref>` | display only | storefront/i18n.ts:272 | Confirmation page says email/SMS were sent "(simulated; nothing was sent)". |
| BP-P04-PAY-008 | 33 | Payment | Receive PDF Invoice | VAT-compliant ZATCA invoice | not stated | — | not built | — |  |
| BP-P04-PAY-009 | 33 | Payment | Wallet Top-Up | Add funds via payment gateway | not stated | — | not built | — |  |

### P04-PST — Post-Order (declared 11)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P04-PST-001 | 34 | Post-Order | Track Shipment | Click tracking link in notification or order page | not stated | `#/store/track`, `#/store/track/<ref>` | working (simulated) | storefront/pages/Order.tsx:170-300 | Tracking number shown; no carrier link; progress advanced by a test button. |
| BP-P04-PST-002 | 34 | Post-Order | View Real-Time Order Status | Confirmed → Shipped → Out for Delivery → Delivered | not stated | `#/store/track/<ref>` | working (simulated) | storefront/pages/Order.tsx:246-262; storefront/domain.ts:544-556 | Label → in transit → out for delivery → delivered, advanced manually in a test box. |
| BP-P04-PST-003 | 34 | Post-Order | Receive Delivery Notification | Email + SMS when delivered | not stated | — | not built | — |  |
| BP-P04-PST-004 | 34 | Post-Order | Confirm Delivery | Mark as received | not stated | `#/store/track/<ref>` | working (simulated) | storefront/pages/Order.tsx:272 |  |
| BP-P04-PST-005 | 34 | Post-Order | Rate Product (Star + Text + Photo) | 1–5 star product review | not stated | — | not built | — |  |
| BP-P04-PST-006 | 34 | Post-Order | Rate Store Experience | Overall store rating | not stated | — | not built | — |  |
| BP-P04-PST-007 | 34 | Post-Order | Rate Shipping Carrier | Carrier service rating | not stated | — | not built | — |  |
| BP-P04-PST-008 | 34 | Post-Order | Request Return | Initiate return from order page | not stated | `#/store/returns/<ref>` | working (simulated) | storefront/pages/Returns.tsx:11-164; test: storefront/domain.test.ts "allows returns within the window, excluding fragrance" | The merchant never sees these returns (separate fixtures). |
| BP-P04-PST-009 | 34 | Post-Order | Request Refund | Refund with reason | not stated | `#/store/returns/<ref>` | partial | storefront/pages/Returns.tsx:45-61 | Refund only as part of a return (estimate, IBAN for COD); no standalone refund request. |
| BP-P04-PST-010 | 34 | Post-Order | Contact Merchant | Message/WhatsApp to merchant support | not stated | — | not built | — | Footer shows care hours text only. |
| BP-P04-PST-011 | 34 | Post-Order | One-Click Reorder | Re-add past order to cart | not stated | `#/store/track/<ref>` | working (simulated) | storefront/pages/Order.tsx:225-233 |  |

### P04-NTF — Notifications (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P04-NTF-001 | 34 | Notifications | Order Status Updates | Push/email/SMS per event | not stated | — | not built | — |  |
| BP-P04-NTF-002 | 35 | Notifications | Shipment Dispatched / Delivered | Logistics event notifications | not stated | — | not built | — |  |
| BP-P04-NTF-003 | 35 | Notifications | Wishlist Price Drop | Alert when saved item price drops | not stated | — | not built | — |  |
| BP-P04-NTF-004 | 35 | Notifications | Wishlist Restock | Alert when out-of-stock item restocks | not stated | — | not built | — |  |
| BP-P04-NTF-005 | 35 | Notifications | Wishlist Low Stock | Alert when wishlist item runs low | not stated | — | not built | — |  |
| BP-P04-NTF-006 | 35 | Notifications | Abandoned Cart Reminder | Re-engagement with optional discount | not stated | — | not built | — |  |

## P05 — Merchant Mobile App (App Maker)

Declared: 36 features. PDF pages 35–38. Sum of declared group counts = 32, not 36.

### P05-DSN — Design — Merchant (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P05-DSN-001 | 35 | Design — Merchant | Homepage Screen Builder | Configure hero, categories, featured products, banners | Plus+ | `#/appmaker/layout` | working (simulated) | appmaker/index.tsx:356-472; test: appmaker/domain.test.ts "moves sections with bounds and keeps others intact" | Reorder with buttons, no drag. |
| BP-P05-DSN-002 | 35 | Design — Merchant | Brand Customization | Colors, fonts, logo, splash screen, app icon | Plus+ | `#/appmaker/identity` | partial | appmaker/index.tsx:286-336 | Preset colours, preset icons and splash colour; no logo or font upload. |
| BP-P05-DSN-003 | 35 | Design — Merchant | Product Grid / List Toggle | Choose display style for product listings | Plus+ | `#/appmaker/layout` | working (simulated) | appmaker/index.tsx:445-450 |  |

> Count mismatch: header declares 6, 3 rows present in source (3 missing). Missing rows are not invented here.
> Note: Group description names a drag-and-drop screen editor, a live phone preview and post-launch design pushes; no rows are present for them.

### P05-PUB — Publishing — Merchant (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P05-PUB-001 | 36 | Publishing — Merchant | Fill App Store Details | App name, description, keywords, screenshots, category | Plus+ | `#/appmaker/listing` | working (simulated) | appmaker/index.tsx:474-546; test: appmaker/domain.test.ts "flags invalid URLs, long subtitles and missing screenshots" | Screenshots are generated mini previews. |
| BP-P05-PUB-002 | 36 | Publishing — Merchant | Submit for Lak Review | 2–7 day review window | Plus+ | `#/appmaker/publish` | working (simulated) | appmaker/index.tsx:617-732; test: appmaker/domain.test.ts "waits for LAK review before building" | LAK review result is simulated in a test panel. |
| BP-P05-PUB-003 | 36 | Publishing — Merchant | Apple App Store Publishing | iOS app built, signed, and published | Plus+ | `#/appmaker/releases/<id>` | working (simulated) | appmaker/index.tsx:771-905; test: appmaker/domain.test.ts "QA21: a successful build then an Apple rejection is never shown as published" | Build, signing, upload and Apple review are all simulated. |
| BP-P05-PUB-004 | 36 | Publishing — Merchant | Google Play Publishing | Android app built, signed, and published | Plus+ | `#/appmaker/releases/<id>` | working (simulated) | appmaker/index.tsx:771-905; test: appmaker/domain.test.ts "rebuilds a failed build with a new build number, and resolves store actions" | Build, signing, upload and Google review are all simulated. |

> Count mismatch: header declares 5, 4 rows present in source (1 missing). Missing rows are not invented here.

### P05-SYN — Sync — Merchant (declared 4)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P05-SYN-001 | 36 | Sync — Merchant | Product Sync (Real-Time) | App auto-syncs products from store | Plus+ | — | not built | appmaker/fixtures.ts:13 | The phone preview uses its own catalogue, not the merchant's products. |
| BP-P05-SYN-002 | 36 | Sync — Merchant | Order Sync | All app orders visible in store dashboard | Plus+ | `#/merchant/orders?ch=app` | display only | merchant/orders.tsx:19-24 | "Store app" is a channel on fixture orders; no app places orders. |
| BP-P05-SYN-003 | 36 | Sync — Merchant | Inventory Sync | Stock levels synchronized across web and app | Plus+ | — | not built | — |  |
| BP-P05-SYN-004 | 36 | Sync — Merchant | Price & Promo Sync | Discounts and offers auto-appear in app | Plus+ | — | not built | — |  |

### P05-APP — App Features — Customer (declared 7)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P05-APP-001 | 36 | App Features — Customer | Full Product Catalog | Browse all products with search and filters | Plus+ | `#/appmaker/*` (phone preview) | partial | appmaker/preview.tsx:33-158 | Home sections and a product screen in a web phone preview; no search or filters. |
| BP-P05-APP-002 | 37 | App Features — Customer | Cart & Full Checkout Flow | Complete checkout identical to web store | Plus+ | `#/appmaker/*` (phone preview) | partial | appmaker/preview.tsx:159-180 | Cart works; checkout button is disabled ("preview only"). |
| BP-P05-APP-003 | 37 | App Features — Customer | Push Notifications | Order updates, promotions, restock alerts | Plus+ | `#/appmaker/layout` | display only | appmaker/preview.tsx:189; appmaker/domain.ts:29 | Feature switch only; no push. |
| BP-P05-APP-004 | 37 | App Features — Customer | Order Tracking (In-App) | Track shipment within app | Plus+ | — | not built | — |  |
| BP-P05-APP-005 | 37 | App Features — Customer | Account, Profile & Wishlist | Login, order history, wishlist management | Plus+ | `#/appmaker/*` (phone preview) | display only | appmaker/preview.tsx:182-193 | Account screen lists items; not operable. |
| BP-P05-APP-006 | 37 | App Features — Customer | Loyalty Points (In-App) | Earn and redeem points in app | Plus+ | `#/appmaker/*` (phone preview) | display only | appmaker/preview.tsx:188 | Listed in the preview account screen when switched on. |
| BP-P05-APP-007 | 37 | App Features — Customer | Reviews (In-App) | Submit reviews from within app | Plus+ | `#/appmaker/*` (phone preview) | display only | appmaker/preview.tsx:155 | Static reviews block in the preview. |

### P05-BLD — Build Infrastructure (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P05-BLD-001 | 37 | Build Infrastructure | Cloud CI/CD Build Server | Android AAB and iOS IPA automated builds | Admin | `#/appmaker/releases/<id>` | backend required | appmaker/domain.ts:216-310 | UI simulates build states; no build server. |
| BP-P05-BLD-002 | 37 | Build Infrastructure | Automated Signing | Code signing for both platforms | Admin | `#/appmaker/releases/<id>` | backend required | appmaker/domain.ts:216-310 | Signing simulated; secrets deliberately not handled in the frontend. |
| BP-P05-BLD-003 | 37 | Build Infrastructure | Store Upload API | Google Play and App Store Connect API for automated upload | Admin | `#/appmaker/releases/<id>` | backend required | appmaker/domain.ts:216-310 | Upload simulated. |

> Count mismatch: header declares 5, 3 rows present in source (2 missing). Missing rows are not invented here.
> Note: Group description names build-status notifications and OTA config updates; no rows are present for them.

### P05-INA — In-App Shopping (Customer View) (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P05-INA-001 | 37 | In-App Shopping (Customer View) | Full Store in Native App | All shopping features in branded iOS/Android app | not stated | `#/appmaker/*` (phone preview) | display only | appmaker/preview.tsx:33-211 | Web preview only; no native app exists. |
| BP-P05-INA-002 | 37 | In-App Shopping (Customer View) | Push Notifications | Order updates, promotions, stock alerts | not stated | `#/appmaker/layout` | display only | appmaker/preview.tsx:189 | Feature switch only. |
| BP-P05-INA-003 | 37 | In-App Shopping (Customer View) | In-App Order Tracking | Track shipment within app | not stated | — | not built | — |  |
| BP-P05-INA-004 | 38 | In-App Shopping (Customer View) | In-App Wishlist | Add/remove from wishlist | not stated | `#/appmaker/*` (phone preview) | display only | appmaker/preview.tsx:141; appmaker/preview.tsx:187 | Wishlist icon/menu item shown, not operable. |
| BP-P05-INA-005 | 38 | In-App Shopping (Customer View) | In-App Loyalty Points | View and redeem points | not stated | `#/appmaker/*` (phone preview) | display only | appmaker/preview.tsx:188 | Shown, not operable. |

> Note: No group description and no ACCESS column in source. Rows overlap App Features — Customer.

## P06 — Global Lak App & Marketplace

Declared: 49 features. PDF pages 38–40. Source column is AUDIENCE, not ACCESS. Sum of declared group counts = 21, not 49. Project intro names POS, Enterprise, App/Theme stores and Academy; no groups or rows exist for them.

### P06-MKP — Lak Marketplace (declared 9)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P06-MKP-001 | 38 | Lak Marketplace | Auto-Listing (Built-In) | All Lak store products listed automatically — zero merchant effort | not stated (audience: Merchant) | `#/market/seller` | partial | market/index.tsx:837-932; market/domain.ts:241-262 | Changed: per-item submission against eligibility rules (excluded categories, store verification), not automatic. |
| BP-P06-MKP-002 | 38 | Lak Marketplace | Zero Commission Marketplace | No sales commission charged to merchants | not stated (audience: Merchant) | `#/market/help` | deferred: decision needed | market/i18n.ts:203-206 | Shown as "0 % proposed in source" with other fees itemised; commercial terms pending. |
| BP-P06-MKP-003 | 38 | Lak Marketplace | Products Listed | Full product depth across stores | not stated (audience: Consumer) | `#/market?q=&cat=` | working (simulated) | market/index.tsx:173-272; test: market/domain.test.ts "searches across sellers in both languages and by store name" | Fixture sellers and products. |
| BP-P06-MKP-004 | 38 | Lak Marketplace | Consumer iOS App | Lak Marketplace app on Apple App Store | not stated (audience: Consumer) | — | not built | — | App Store button disabled on the site (site/home.tsx:245); web demo only. |
| BP-P06-MKP-005 | 38 | Lak Marketplace | Consumer Android App | Lak Marketplace app on Google Play | not stated (audience: Consumer) | — | not built | — | Google Play button disabled on the site (site/home.tsx:246). |
| BP-P06-MKP-006 | 38 | Lak Marketplace | Location-Based Discovery | Show nearby merchants / local products | not stated (audience: Consumer) | `#/market?near=1&city=<id>` | working (simulated) | market/index.tsx:202; test: market/domain.test.ts "filters by category, brand, seller and location, and sorts by price" | City picked manually; no geolocation. |
| BP-P06-MKP-007 | 38 | Lak Marketplace | Category & Brand Browse | Structured discovery within Lak Marketplace | not stated (audience: Consumer) | `#/market?cat=&brand=` | working (simulated) | market/index.tsx:182-200 |  |
| BP-P06-MKP-008 | 39 | Lak Marketplace | Merchant Profile Page | Store profile visible in Lak Marketplace directory | not stated (audience: Merchant) | `#/market/s/<id>` | working (simulated) | market/index.tsx:319-347 |  |

> Count mismatch: header declares 9, 8 rows present in source (1 missing). Missing rows are not invented here.

### P06-WHS — Lak Wholesale (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P06-WHS-001 | 39 | Lak Wholesale | Wholesaler Account | Supplier lists products at wholesale prices | not stated (audience: Merchant) | — | not built | — |  |
| BP-P06-WHS-002 | 39 | Lak Wholesale | Retailer Account | Retailers browse and buy in bulk | not stated (audience: Merchant) | — | not built | — |  |
| BP-P06-WHS-003 | 39 | Lak Wholesale | Instant Product Sync from Lak | Auto-sync store catalog to Lak Wholesale listing | not stated (audience: Merchant) | — | not built | — |  |
| BP-P06-WHS-004 | 39 | Lak Wholesale | Inventory Sync | Real-time stock across both channels | not stated (audience: Merchant) | — | not built | — |  |
| BP-P06-WHS-005 | 39 | Lak Wholesale | Wholesale Order Dashboard | Bulk orders in main Lak dashboard | not stated (audience: Merchant) | — | not built | — |  |

> Note: Plan matrix (page 43) gates Lak Wholesale to Plus+.

### P06-ADS — Lak Ads (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P06-ADS-001 | 39 | Lak Ads | Google / YouTube Campaigns | Managed PPC from Lak dashboard | not stated (audience: Merchant) | — | not built | — |  |
| BP-P06-ADS-002 | 39 | Lak Ads | TikTok Campaigns | TikTok for Business integration | not stated (audience: Merchant) | — | not built | — |  |
| BP-P06-ADS-003 | 39 | Lak Ads | Snapchat Campaigns | Snapchat Business integration | not stated (audience: Merchant) | — | not built | — |  |
| BP-P06-ADS-004 | 39 | Lak Ads | Meta / Instagram Campaigns | Meta Business suite integration | not stated (audience: Merchant) | — | not built | — |  |
| BP-P06-ADS-005 | 39 | Lak Ads | X (Twitter) Campaigns | X Ads integration | not stated (audience: Merchant) | — | not built | — |  |
| BP-P06-ADS-006 | 39–40 | Lak Ads | Campaign Analytics in Dashboard | All ad performance in one view | not stated (audience: Merchant) | — | not built | — |  |

> Note: Plan matrix (page 43) gates Lak Ads to Plus+. Overlaps P03 Marketing — Ads.

### P06-COM — Lak Community (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-P06-COM-001 | 40 | Lak Community | Community Hub | Forums, events, news, groups at community.lak.sa | not stated (audience: Merchant) | — | not built | — |  |

## Shared Services — Integrations (PDF pages 40–42)

Declared: 67 integrations across payment, shipping, government/tax, ERP, marketing, analytics, communication and automation. Listed in source: 50. No ERP, accounting or automation integrations are listed although the section intro and plan matrix name them. Format in source: `Name — description · region/scope`.

| ID | PDF page | Category | Integration | Description | Region / scope | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|
| BP-INT-PAY-001 | 40 | Payment — Local KSA | Mada | Saudi debit card gateway | KSA | `#/merchant/settings/payments`, `#/store/checkout` | backend required | merchant/workspace.ts:101; storefront/pages/Checkout.tsx:146 | UI simulates connection and card outcomes. |
| BP-INT-PAY-002 | 40 | Payment — Local KSA | STC Pay | Mobile wallet | KSA | `#/merchant/settings/payments` | backend required | merchant/workspace.ts:104 | UI simulates connection only. |
| BP-INT-PAY-003 | 40 | Payment — Local KSA | Madfu | BNPL | KSA | — | backend required | — | No UI either. |
| BP-INT-PAY-004 | 40 | Payment — Local KSA | Emkan | Installments | KSA | — | backend required | — | No UI either. |
| BP-INT-PAY-005 | 40 | Payment — Local KSA | Mokafa | Loyalty redemption payment | KSA | — | backend required | — | No UI either. |
| BP-INT-PAY-006 | 40 | Payment — Local GCC | Tabby | BNPL — Buy Now Pay Later | KSA/UAE | `#/merchant/settings/payments`, `#/store/checkout` | backend required | merchant/workspace.ts:105; storefront/pages/Checkout.tsx:148 | UI simulates connection; checkout shows a generic instalment option. |
| BP-INT-PAY-007 | 40 | Payment — Local GCC | Tamara | BNPL | KSA/UAE | `#/merchant/settings/payments` | backend required | merchant/workspace.ts:106 | UI simulates connection only. |
| BP-INT-PAY-008 | 40 | Payment — Local GCC | MIS Pay | GCC mobile payment | GCC | — | backend required | — | No UI either. |
| BP-INT-PAY-009 | 40 | Payment — International | Visa / Mastercard / Amex | Card processing | Global | `#/merchant/settings/payments`, `#/store/checkout` | backend required | merchant/workspace.ts:102; storefront/pages/Checkout.tsx:146 | Visa/Mastercard simulated; no Amex. |
| BP-INT-PAY-010 | 40 | Payment — International | Apple Pay | Mobile wallet | Global | `#/merchant/settings/payments`, `#/store/checkout` | backend required | merchant/workspace.ts:103; storefront/pages/Checkout.tsx:147 | Shown only when the "device supports Apple Pay" test toggle is on. |
| BP-INT-PAY-011 | 40 | Payment — International | PayPal | Digital wallet | Global | — | backend required | — | No UI either. |
| BP-INT-PAY-012 | 40–41 | Payment — International | Stripe | Card processing (via partner) | Global | — | backend required | — | No UI either. |
| BP-INT-PAY-013 | 40 | Payment — Manual | Bank Transfer | Manual bank details display | All | `#/merchant/settings/payments` | partial | merchant/workspace.ts:100 | Listed as active for the merchant; storefront offers no bank transfer or slip upload. |
| BP-INT-PAY-014 | 40 | Payment — Manual | Cash on Delivery | COD with configurable limits | All | `#/store/checkout` | working (simulated) | storefront/pages/Checkout.tsx:149; test: storefront/domain.test.ts "adds the COD fee when the shopper switches to cash on delivery" | Manual method, simulated end to end. |
| BP-INT-SHP-001 | 41 | Shipping — KSA | Fastlo | Saudi carrier, auto-status update | KSA | — | backend required | — | Merchant labels use two generic demo carriers only. |
| BP-INT-SHP-002 | 41 | Shipping — KSA | Salasa | Saudi carrier, auto-status update | KSA | — | backend required | — |  |
| BP-INT-SHP-003 | 41 | Shipping — KSA | Nakel | Saudi carrier | KSA | — | backend required | — |  |
| BP-INT-SHP-004 | 41 | Shipping — KSA | SMSA | Saudi postal carrier | KSA | — | backend required | — |  |
| BP-INT-SHP-005 | 41 | Shipping — KSA | Aymakan | Saudi carrier | KSA | — | backend required | — |  |
| BP-INT-SHP-006 | 41 | Shipping — KSA | Prolo | Saudi carrier | KSA | — | backend required | — |  |
| BP-INT-SHP-007 | 41 | Shipping — KSA | Esnad | Saudi carrier | KSA | — | backend required | — |  |
| BP-INT-SHP-008 | 41 | Shipping — KSA | Marsul | Saudi carrier | KSA | — | backend required | — |  |
| BP-INT-SHP-009 | 41 | Shipping — KSA | Track | Saudi carrier | KSA | — | backend required | — |  |
| BP-INT-SHP-010 | 41 | Shipping — KSA | Redbox | Saudi carrier | KSA | — | backend required | — |  |
| BP-INT-SHP-011 | 41 | Shipping — GCC | Aramex | Regional + global carrier | GCC+ | — | backend required | — |  |
| BP-INT-SHP-012 | 41 | Shipping — GCC | Shipa | GCC carrier | GCC | — | backend required | — |  |
| BP-INT-SHP-013 | 41 | Shipping — GCC | Emirates Post | UAE postal service | UAE | — | backend required | — |  |
| BP-INT-SHP-014 | 41 | Shipping — Global | DHL | Global express | Global | — | backend required | — |  |
| BP-INT-SHP-015 | 41 | Shipping — Global | iMile | GCC + global | GCC+ | — | backend required | — |  |
| BP-INT-SHP-016 | 41 | Shipping — Global | Diggipacks | Packaging + delivery | GCC | — | backend required | — |  |
| BP-INT-GOV-001 | 41 | Government / Tax | ZATCA Fatoora (KSA) | E-invoicing clearance + reporting | KSA | — | backend required | admin/screens/payments.tsx:103 | Admin shows e-invoicing as "pending contract". |
| BP-INT-GOV-002 | 41 | Government / Tax | UAE Federal Tax Authority | UAE VAT e-invoicing | UAE | — | backend required | — |  |
| BP-INT-GOV-003 | 41 | Government / Tax | Egyptian Tax Authority | Egypt VAT | EGY | — | backend required | — |  |
| BP-INT-GOV-004 | 41 | Government / Tax | Bahrain NBR | Bahrain VAT | BHR | — | backend required | — |  |
| BP-INT-GOV-005 | 41 | Government / Tax | Oman Tax Authority | Oman VAT | OMN | — | backend required | — |  |
| BP-INT-EML-001 | 41 | Marketing — Email | Klaviyo | Email & SMS automation | All | — | backend required | — |  |
| BP-INT-EML-002 | 41 | Marketing — Email | Mailchimp | Email marketing | All | — | backend required | — |  |
| BP-INT-SOC-001 | 41 | Marketing — Social | Facebook / Meta Ads | Ad campaigns + pixel | All | — | backend required | — |  |
| BP-INT-SOC-002 | 41 | Marketing — Social | TikTok Shop & Ads | Catalog sync + campaigns | All | — | backend required | — |  |
| BP-INT-SOC-003 | 41 | Marketing — Social | Snapchat Ads | Campaign management | All | — | backend required | — |  |
| BP-INT-SOC-004 | 42 | Marketing — Social | Google Ads / Shopping | Search + shopping campaigns | All | — | backend required | — |  |
| BP-INT-SOC-005 | 42 | Marketing — Social | Twitter / X Ads | Ad campaigns | All | — | backend required | — |  |
| BP-INT-ANA-001 | 42 | Analytics | Google Analytics 4 | Site analytics | All | `#/merchant/apps/ga` | backend required | merchant/workspace.ts:225 | Sample app with simulated connection. |
| BP-INT-ANA-002 | 42 | Analytics | Google Tag Manager | Tag container | All | — | backend required | — |  |
| BP-INT-ANA-003 | 42 | Analytics | Hotjar | Heatmaps + session recording | All | — | backend required | — |  |
| BP-INT-ANA-004 | 42 | Analytics | Facebook Pixel | Conversion tracking | All | — | backend required | — |  |
| BP-INT-COM-001 | 42 | Communication | SMS Gateway | Generic SMS OTP + notifications | All | — | backend required | — | Every "SMS sent" message in the UI is labelled simulated. |
| BP-INT-COM-002 | 42 | Communication | WhatsApp Business API | Order confirmations, updates via WhatsApp | All | `#/merchant/apps/wa` | backend required | merchant/workspace.ts:224 | Sample app with simulated connection. |
| BP-INT-MKP-001 | 42 | Marketplace — B2C | Lak Marketplace | Free consumer marketplace (built-in) | All | `#/market` | partial | market/index.tsx:34-82 | Separate demo surface with its own fixtures; no catalogue flows from merchants. |
| BP-INT-MKP-002 | 42 | Marketplace — B2B | Lak Wholesale | Wholesale B2B marketplace (built-in) | Plus+ | — | not built | — |  |

| Category | Listed |
|---|---|
| Payment (Local KSA 5, Local GCC 3, International 4, Manual 2) | 14 |
| Shipping (KSA 10, GCC 3, Global 3) | 16 |
| Government / Tax | 5 |
| Marketing — Email | 2 |
| Marketing — Social | 5 |
| Analytics | 4 |
| Communication | 2 |
| Marketplace (B2C 1, B2B 1) | 2 |
| **Total listed** | **50** (declared 67) |

> Note: The "· All" suffix on marketing/analytics integrations reads as region scope, not plan access; it conflicts with plan gates if read as a plan (Lak Ads channels are Plus+ in P03 and in the plan matrix).
> Note: Stripe is listed here but has no row in P03 Payment Setup. TikTok Pixel has a row in P03 Marketing — Analytics but is not listed here. Klaviyo, Mailchimp, Google Shopping and TikTok Shop have no P03 feature rows.

## Subscription Plans & Feature Gating (PDF pages 42–45)

Tiers: Basic (FREE), Plus, Pro, Special (ENTERPRISE). Values copied as shown (✓ / ✗ / text). No prices are given in the source.

| ID | PDF page | Feature | Basic (Free) | Plus | Pro | Special (Enterprise) | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| BP-PLN-001 | 42 | Unlimited Products | ✓ | ✓ | ✓ | ✓ | `#/site/plans`, `#/admin/plans`, `#/merchant/finance?tab=billing` | display only | site/content.ts:54 | Shown with an "unlimited is a fair-use target" note; nothing to enforce. |
| BP-PLN-002 | 42 | Unlimited Customers | ✓ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:55 |  |
| BP-PLN-003 | 42 | Unlimited Orders | ✓ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:56 |  |
| BP-PLN-004 | 42 | Sales Commission | 0% | 0% | 0% | Custom | `#/site/plans` | deferred: decision needed | site/content.ts:57 | Cells say "proposed 0 %" awaiting approval. |
| BP-PLN-005 | 43 | Coupons & Discount Codes | ✓ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:58; merchant/finance.ts:118-122 |  |
| BP-PLN-006 | 43 | Customer Reviews & Q&A | ✓ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:59 | Reviews feature itself not built. |
| BP-PLN-007 | 43 | Cash on Delivery | ✓ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:67 |  |
| BP-PLN-008 | 43 | Bank Transfer Payments | ✓ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:68 |  |
| BP-PLN-009 | 43 | Online Payments (Mada, Cards, Apple Pay, etc.) | ✗ | ✓ | ✓ | ✓ | `#/merchant/settings/payments` | partial | merchant/settings.tsx:216; site/content.ts:69 | Gate enforced in merchant payment settings ("not in your plan"); storefront ignores plan. |
| BP-PLN-010 | 43 | Global Shipping Fleet (Discounted) | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:70 |  |
| BP-PLN-011 | 43 | Lak Shipping Labels + Quality Center | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:71 |  |
| BP-PLN-012 | 43 | Customer Wallet | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:80 |  |
| BP-PLN-013 | 43 | Gift Cards | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:81 |  |
| BP-PLN-014 | 43 | Loyalty Points Program | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:82 |  |
| BP-PLN-015 | 43 | Cashback Program | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:83 |  |
| BP-PLN-016 | 43 | Lak Ads (All Channels) | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:84 |  |
| BP-PLN-017 | 43 | Marketing Email / SMS Campaigns | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:85 |  |
| BP-PLN-018 | 43 | Lak Wholesale B2B Marketplace | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:86 |  |
| BP-PLN-019 | 43 | Accounting Integrations | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:114 |  |
| BP-PLN-020 | 43 | CSS / JS Custom Code | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:98 |  |
| BP-PLN-021 | 43 | Lak Theme Builder | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:96 | Theme Builder scope undefined (discrepancy #6). |
| BP-PLN-022 | 43 | Landing Pages | ✗ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:97 |  |
| BP-PLN-023 | 43 | Connect / Register Domain | Connect | Connect/Register | Free Domain | Free Domain | `#/site/plans` | deferred: decision needed | site/content.ts:95 | Pro/Special "included domain" cell marked awaiting approval. |
| BP-PLN-024 | 44 | Basic Reports | ✓ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:107 |  |
| BP-PLN-025 | 44 | Advanced Reports & Analytics | ✗ | Limited | Full | Full | `#/site/plans` | display only | site/content.ts:108 | "Limited" undefined. |
| BP-PLN-026 | 44 | Staff Accounts | 1 | 3 | Unlimited | Unlimited | `#/merchant/settings/team` | working (simulated) | merchant/finance.ts:125; merchant/settings.tsx:118-120; merchant/settings.tsx:157 | Seat limit enforced on invite with a plan-limit message. |
| BP-PLN-027 | 44 | Staff Roles & RBAC | ✗ | ✗ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:110 | Changed in practice: the four merchant roles work on every plan (security baseline per skill ch. 08 #4). |
| BP-PLN-028 | 44 | Multiple Stores | 1 | 1 | Unlimited | Unlimited | `#/site/plans` | display only | site/content.ts:111 | Multi-store not built. |
| BP-PLN-029 | 44 | Customer Segmentation | ✗ | ✗ | ✓ | ✓ | `#/merchant/settings/team` | display only | site/content.ts:87; merchant/settings.tsx:164 | Segments shown on all plans in the customers screen; gate not enforced. |
| BP-PLN-030 | 44 | Affiliate Program | ✗ | ✗ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:88 |  |
| BP-PLN-031 | 44 | Influencer Campaigns | ✗ | ✗ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:89 |  |
| BP-PLN-032 | 44 | 3D Product View | ✗ | ✗ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:99 |  |
| BP-PLN-033 | 44 | Bulk / Quantity Pricing | ✗ | ✗ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:100 |  |
| BP-PLN-034 | 44 | Restrict Shipping Visibility | ✗ | ✗ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:72 |  |
| BP-PLN-035 | 44 | Auto-Assign Warehouse by City | ✗ | ✗ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:112 |  |
| BP-PLN-036 | 44 | Order Scheduling / Booking | ✗ | ✗ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:113 |  |
| BP-PLN-037 | 44 | Bank Offers at Checkout | ✗ | ✗ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:73 |  |
| BP-PLN-038 | 44 | App Maker (Mobile App) | ✗ | Add-on | Add-on | Add-on | `#/appmaker/plan` | working (simulated) | appmaker/index.tsx:218-273; test: appmaker/domain.test.ts "requires Plus or above and the add-on" | Add-on price not stated. |
| BP-PLN-039 | 44 | Lak Marketplace Auto-Listing | ✓ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:60 |  |
| BP-PLN-040 | 44 | VAT / ZATCA | ✓ | ✓ | ✓ | ✓ | `#/site/plans` | display only | site/content.ts:61 | ZATCA itself is backend-only. |
| BP-PLN-041 | 44 | ERP Integration | ✗ | ✗ | Limited | Full | `#/site/plans` | display only | site/content.ts:115 |  |
| BP-PLN-042 | 44 | Multi-Branch (Advanced) | ✗ | ✗ | Basic | Advanced | `#/site/plans` | display only | site/content.ts:116 |  |
| BP-PLN-043 | 44 | Flexible Payment Fees | ✗ | ✗ | ✗ | ✓ | `#/site/plans` | display only | site/content.ts:74 |  |
| BP-PLN-044 | 44 | Dedicated Account Manager | ✗ | ✗ | ✗ | ✓ | `#/site/plans` | display only | site/content.ts:122 |  |
| BP-PLN-045 | 45 | Custom Integrations | ✗ | ✗ | ✗ | ✓ | `#/site/plans` | display only | site/content.ts:123 |  |
| BP-PLN-046 | 45 | SLA-Backed Priority Support | ✗ | ✗ | ✗ | ✓ | `#/site/plans` | display only | site/content.ts:124 |  |

### Plan matrix vs feature rows — discrepancies

| # | Item | Feature-row evidence | Matrix evidence | Open point |
|---|---|---|---|---|
| 1 | Staff accounts | BP-P03-STF-001 Create Staff Accounts = All plans | Staff Accounts 1 / 3 / Unlimited | Whether "1" on Basic means owner only |
| 2 | Customer wallet | BP-P03-CUS-010 Customer Wallet View = All plans | Customer Wallet ✗ on Basic | View row exposed on a plan without the wallet |
| 3 | Fraud / 3DS | AI Fraud Detection, 3-D Secure, PCI DSS = All plans | Online Payments ✗ on Basic | Not applicable to a COD/bank-transfer-only plan |
| 4 | Multi-branch | Create Warehouse / Branch, Transfer Between Inventories = All plans | Multi-Branch (Advanced) ✗ / ✗ / Basic / Advanced | "Basic" vs "Advanced" multi-branch undefined |
| 5 | Advanced reports | Sales, Products, Customers, Shipping, Coupons, Abandoned Cart, Export = Pro | Advanced Reports: Plus = Limited | No report row is marked Plus+; "Limited" undefined |
| 6 | Theme Builder | No feature row named Lak Theme Builder | Lak Theme Builder Plus+ | Scope undefined (only CSS / JS Custom Code Editor exists) |
| 7 | Domains | Connect External Domain = All plans; Register / Transfer / DNS = Plus+ | Pro and Special = Free Domain | Who pays for the free domain, and term |
| 8 | App Maker | BP-P03-CHN-002 and all P05 rows = Plus+ | Add-on on Plus / Pro / Special | Add-on price and billing not stated |
| 9 | Accounting / ERP | No feature rows, no integrations listed | Accounting Plus+; ERP Limited (Pro) / Full (Special) | Providers and scope undefined |
| 10 | Sales commission | BP-P06-MKP-002 Zero Commission Marketplace | Special = Custom | Custom commission vs zero-commission claim |
| 11 | Lak Wholesale | P03 Sales Channels row missing; P06 rows carry audience only | Plus+ | Gate comes from matrix and integrations list only |
| 12 | Email/SMS | Welcome, Abandoned Cart, Wishlist alerts = All plans; Broadcast = Plus+ | Marketing Email / SMS Campaigns ✗ on Basic | SMS/WhatsApp message cost on the free plan not addressed |
| 13 | Pro-gated rows absent from matrix | Product Types: Subscription, Smart Cart Offers, Smart Purchase Reminder, Assign Order to Staff, Staff Activity Log | No matrix line | Matrix is not exhaustive |
| 14 | Plus-gated rows absent from matrix | Multi-Currency Checkout, Product Landing Pages, DNS Management, Transfer Domain | No matrix line (Landing Pages only) | Matrix is not exhaustive |

## Core User Journeys (PDF pages 45–46)

### Merchant journey

| ID | PDF page | Step | Description | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|
| BP-JRN-MER-01 | 45 | 1 | Register Account (Individual / Corporate / Charity / Sole Proprietorship) | `#/site/start` | partial | site/start.tsx:62-140 | Minimal simulated sign-up; no entity types, OTP or documents. |
| BP-JRN-MER-02 | 45 | 2 | Choose & Pay for Subscription Plan (Basic / Plus / Pro / Special) | `#/site/start?plan=<id>` | deferred: decision needed | site/start.tsx:131-137 | Plan is an optional choice; no prices and no payment. |
| BP-JRN-MER-03 | 45 | 3 | Complete KYC & Store Verification (docs upload, approval) | `#/merchant` (new-store mode), `#/admin/kyc` | partial | merchant/home.tsx:171-200; admin/screens/kyc.tsx:57-168 | Merchant side has no document upload; verification outcomes simulated; the two surfaces do not share data. |
| BP-JRN-MER-04 | 45 | 4 | Configure Store: Theme, Logo, Colors, Domain | `#/merchant/storefront`, `#/merchant/settings/domains` | partial | merchant/storefront.tsx:48-75; merchant/settings.tsx:315-366 | Sections and domain only; no theme choice, logo or colours. |
| BP-JRN-MER-05 | 45 | 5 | Setup Payment Methods (To be determined) | `#/merchant/settings/payments` | partial | merchant/settings.tsx:199-257 | Connection simulated; source itself says "to be determined". |
| BP-JRN-MER-06 | 45 | 6 | Setup Shipping Zones & Connect Carriers | `#/merchant/settings/shipping` | partial | merchant/settings.tsx:259-313 | Zones yes; carriers cannot be connected. |
| BP-JRN-MER-07 | 45 | 7 | Add Categories, Brands, Products, Variants, Bundles | `#/merchant/products/new` | partial | merchant/product-editor.tsx:17-296 | Products and colour × size variants; no brands, bundles or category tree. |
| BP-JRN-MER-08 | 45 | 8 | Configure Inventory & Warehouses / Branches | `#/merchant/inventory` | partial | merchant/inventory-page.tsx:78-406 | Two fixed warehouses; adjust and transfer work. |
| BP-JRN-MER-09 | 45 | 9 | Configure Tax Rules | — | display only | merchant/domain.ts:172 | Fixed 15 % VAT. |
| BP-JRN-MER-10 | 45 | 10 | Set Pricing, Discounts, Coupons, Loyalty, Cashback | `#/merchant/marketing` | partial | merchant/marketing.tsx:48-153 | Coupons only; no loyalty or cashback. |
| BP-JRN-MER-11 | 45 | 11 | Publish Store & Activate Accept Orders | `#/merchant/storefront` | partial | merchant/storefront.tsx:36-45 | Toggles do not affect `#/store`. |
| BP-JRN-MER-12 | 45 | 12 | Receive Orders → Review → Confirm → Create Shipment → Ship → Deliver | `#/merchant/orders` | partial | merchant/order.tsx:160-297 | Confirm and label work; ship/deliver not merchant-operable; storefront orders never arrive here. |
| BP-JRN-MER-13 | 45 | 13 | Process Returns, Refunds, Exchanges | `#/merchant/orders/<ref>` | partial | merchant/order.tsx:299-382 | Refund + restock; no exchange. |
| BP-JRN-MER-14 | 46 | 14 | Run Marketing Campaigns, Ads, Influencer Programs | `#/merchant/marketing`, `#/merchant/automations` | partial | merchant/marketing.tsx:155-230; merchant/automations.tsx:96-215 | Abandoned-cart campaign and automations; no ads or influencers. |
| BP-JRN-MER-15 | 46 | 15 | Analyze Reports → Optimize → Grow | `#/merchant/analytics`, `#/merchant/finance` | partial | merchant/analytics.tsx:14-107; merchant/finance-page.tsx:52-190 | Four metrics and finance; most reports missing. |
| BP-JRN-MER-16 | 46 | 16 | Optionally: Build Mobile App via App Maker | `#/appmaker` | working (simulated) | appmaker/index.tsx:50-100 | All external steps simulated. |
| BP-JRN-MER-17 | 46 | 17 | Optionally: Manage in-person sales via POS (separate platform) | — | not built | — | POS is a separate platform in the source. |

### Customer journey

| ID | PDF page | Step | Description | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|
| BP-JRN-CUS-01 | 45 | 1 | Discover Store (Direct URL / Social Ad / SEO result) | `#/store`, `#/market` | partial | storefront/index.tsx:18-36; market/index.tsx:173-272 | Direct URL and marketplace; no social/SEO entry. |
| BP-JRN-CUS-02 | 45 | 2 | Browse Categories, Brands, Search Products | `#/store/c/<cat>`, `#/store/search` | partial | storefront/pages/Listing.tsx:34-168 | No brand pages. |
| BP-JRN-CUS-03 | 45 | 3 | View Product Detail (images, reviews, Q&A, variants, stock, shipping estimate) | `#/store/p/<id>` | partial | storefront/pages/Product.tsx:11-198 | No reviews or Q&A. |
| BP-JRN-CUS-04 | 45 | 4 | Add to Cart / Wishlist | `#/store/p/<id>` | working (simulated) | storefront/pages/Product.tsx:60-66; storefront/pages/Product.tsx:153 |  |
| BP-JRN-CUS-05 | 45 | 5 | Login / Register (optional — guest checkout available) | `#/store/checkout` | partial | storefront/pages/Checkout.tsx:233-247 | Guest or simulated one-click sign-in; no registration. |
| BP-JRN-CUS-06 | 45 | 6 | Apply Coupon Code at cart | `#/store/cart` | working (simulated) | storefront/pages/Cart.tsx:32-56 |  |
| BP-JRN-CUS-07 | 45 | 7 | Proceed to Checkout: Address → Shipping Method → Payment Method | `#/store/checkout` | working (simulated) | storefront/pages/Checkout.tsx:233-378 |  |
| BP-JRN-CUS-08 | 45 | 8 | Review Order Summary (items, VAT, discount, total) | `#/store/checkout` | working (simulated) | storefront/pages/Checkout.tsx:186-204 |  |
| BP-JRN-CUS-09 | 45 | 9 | Complete Payment (online / COD / Wallet / Gift Card) | `#/store/checkout` | partial | storefront/pages/Checkout.tsx:145-150 | Simulated online and COD; no wallet or gift card. |
| BP-JRN-CUS-10 | 45 | 10 | Receive Order Confirmation (email + SMS) and PDF Invoice | `#/store/order/<ref>` | partial | storefront/pages/Order.tsx:95-168 | Confirmation page; email/SMS only claimed as simulated; no PDF invoice. |
| BP-JRN-CUS-11 | 45 | 11 | Track Shipment via platform or carrier link | `#/store/track/<ref>` | working (simulated) | storefront/pages/Order.tsx:207-300 | Steps advanced with a test button. |
| BP-JRN-CUS-12 | 45 | 12 | Receive Delivery Notification | — | not built | — |  |
| BP-JRN-CUS-13 | 45 | 13 | Confirm Receipt | `#/store/track/<ref>` | working (simulated) | storefront/pages/Order.tsx:272 |  |
| BP-JRN-CUS-14 | 46 | 14 | Rate Product, Rate Store, Rate Shipping Carrier | — | not built | — |  |
| BP-JRN-CUS-15 | 46 | 15 | Optionally: Request Return / Refund / Exchange | `#/store/returns/<ref>` | partial | storefront/pages/Returns.tsx:11-164 | Return with refund estimate; no exchange. |
| BP-JRN-CUS-16 | 46 | 16 | Earn Loyalty Points, Redeem Cashback | — | not built | — |  |

### Platform admin journey

| ID | PDF page | Step | Description | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|---|---|
| BP-JRN-ADM-01 | 46 | 1 | Login to Super Admin Portal (2FA protected) | — | backend required | admin/index.tsx:56 | No login. |
| BP-JRN-ADM-02 | 46 | 2 | Review & Approve / Reject Merchant Registrations (KYC review) | `#/admin/kyc` | working (simulated) | admin/screens/kyc.tsx:15-168 |  |
| BP-JRN-ADM-03 | 46 | 3 | Manage Merchant Plans, Billing & Renewals | `#/admin/plans` | partial | admin/screens/plans.tsx:84-146 | Plan changes with two-role approval; no billing or renewals. |
| BP-JRN-ADM-04 | 46 | 4 | Monitor All Stores — Suspend / Reactivate as needed | `#/admin/stores` | working (simulated) | admin/screens/stores.tsx:19-225 |  |
| BP-JRN-ADM-05 | 46 | 5 | Manage Payment Gateways & Monitor Transactions | `#/admin/payments` | partial | admin/screens/payments.tsx:32-115 | Ledger and disputes work; gateways are a static list. |
| BP-JRN-ADM-06 | 46 | 6 | Configure Shipping Providers Platform-Wide | `#/admin/shipping` | display only | admin/screens/shipping.tsx:27-42 | Read-only carrier list. |
| BP-JRN-ADM-07 | 46 | 7 | Manage Themes | `#/admin/content` | working (simulated) | admin/screens/content.tsx:11-77 |  |
| BP-JRN-ADM-08 | 46 | 8 | Manage App Marketplace (approve/reject partner apps) | `#/admin/content` | working (simulated) | admin/screens/content.tsx:11-77 |  |
| BP-JRN-ADM-09 | 46 | 9 | Monitor Platform KPIs (Revenue, GMV, Active Stores, MRR) | `#/admin` | working (simulated) | admin/screens/overview.tsx:33-73 | Fixture snapshot. |
| BP-JRN-ADM-10 | 46 | 10 | Manage Help Center, Blog, Static Pages | — | not built | admin/screens/content.tsx:68 |  |
| BP-JRN-ADM-11 | 46 | 11 | Generate Reports & Export Data | `#/admin/reports` | partial | admin/screens/reports.tsx:12-100 | Four reports, CSV only. |
| BP-JRN-ADM-12 | 46 | 12 | Monitor System Health, API Usage, Security Logs, Audit Trails | `#/admin/health`, `#/admin/audit` | partial | admin/screens/health.tsx:9-45; admin/screens/audit.tsx:9-44 | Snapshot only; no API-limit or merchant-user audit. |

### Journey notes

| # | Journey | Observation |
|---|---|---|
| 1 | Merchant step 2 | "Choose & Pay" for a plan although Basic is FREE; payment precedes KYC approval (step 3) |
| 2 | Merchant step 5 | Source text literally says "Setup Payment Methods (To be determined)" |
| 3 | Merchant step 17 | POS is called a "separate platform"; P06 intro lists POS in the ecosystem; no POS features exist |
| 4 | Customer step 1 | Omits Lak Marketplace discovery, which P04 Discovery lists first |
| 5 | Customer step 9 | Omits BNPL and bank transfer, both present in P04 Payment |
| 6 | Customer step 15 | Exchange is offered; P04 Post-Order has Request Return and Request Refund rows only |
| 7 | Admin | No step for influencer directory, announcements or ZATCA configuration, all of which have P02 rows |

## Experience requirements (skill ch. 00–06)

Acceptance scenarios QA01–QA24 (ch. 06), the ten non-negotiables (ch. 00) and the screen-state contract (ch. 01–02). Same status vocabulary.

| ID | Requirement | Screen / route | Status | Evidence | Note |
|---|---|---|---|---|---|
| EXP-QA01 | New merchant sets up a store: save and resume; payment/shipping verification distinct from a filled form | `#/merchant` (test panel → "New store") | working (simulated) | merchant/home.tsx:125-290; test: merchant/workspace.test.ts "separates entered, awaiting verification and ready" | Verification approve/reject are test buttons; progress lives in sessionStorage. |
| EXP-QA02 | Staff reaches a late order from home: reference, period and filters kept; no unauthorised data | `#/merchant` → `#/merchant/orders?view=late` → `#/merchant/orders/<ref>` | partial | merchant/home.tsx:46-55; merchant/order.tsx:30-33 | Context is kept in the URL and the back link; "unauthorised data" is only hidden in the UI — all fixtures ship to the browser. |
| EXP-QA03 | Fulfil part of a multi-location order: correct quantities, one issue per operation, separate fulfilment/shipment state | `#/merchant/orders/<ref>`, `#/v2/orders/<ref>` | working (simulated) | merchant/order.tsx:227-297; v2/order-fulfil.tsx:15-196; test: merchant/domain.test.ts "ships part from each location with one reference per operation and separate states" |  |
| EXP-QA04 | Bulk action on 25 rows of 1,200: explicit scope, ineligible rows, partial success, retry failed only | `#/merchant/orders`, `#/v2/orders` | working (simulated) | merchant/orders.tsx:116-218; v2/orders-bulk.tsx:24-149; test: merchant/domain.test.ts "reports partial success and a retry only processes failures, never repeating successes" | Failures are injected from the test panel. |
| EXP-QA05 | Payment timeout then late return: verifying first, final server result, no duplicate charge/order | `#/store/checkout`, `#/store/order/<ref>` | working (simulated) | storefront/state.ts:135-138; storefront/state.ts:170-176; test: storefront/domain.test.ts "returns the same order for a double submit" | The "server" decision is a client-side state machine in sessionStorage. |
| EXP-QA06 | Refund part of an already-settled amount: correct refundable amount, provider result, reconciliation, separate restock | `#/merchant/orders/<ref>`, `#/merchant/finance` | working (simulated) | merchant/order.tsx:299-382; merchant/order.tsx:316; test: merchant/domain.test.ts "a partial confirmed refund marks partial; a failed one frees the amount again" | Provider confirmation is a test button; refund transaction is added to the finance fixture. |
| EXP-QA07 | Add a product with variants, lose network: no lost input, honest draft/save, recovery message | `#/merchant/products/new`, `#/v2/products/p1` | working (simulated) | merchant/product-editor.tsx:273-276; v2/product.tsx:197; test: merchant/catalog.test.ts "builds a colour × size matrix, keeps typed values and blocks duplicate option values" | Network loss is a test checkbox; "saved" means saved to the session fixture. |
| EXP-QA08 | Import 1,000 lines with duplicates/invalid rows: preview, conflict policy, error report, background result | `#/merchant/products/import` | working (simulated) | merchant/import.tsx:48-220; test: merchant/catalog.test.ts "writes one error-report line per problem and per skipped row" | The file is a built-in sample; no real upload. |
| EXP-QA09 | Last item ordered by two customers: conflict prevented/handled on the server | — | backend required | test: storefront/domain.test.ts "flags lines whose stock changed after adding" | Needs server-side stock reservation; the UI only flags a stock change in the bag. |
| EXP-QA10 | Limited staff opens a report or customer link directly: blocked at the source, no hidden data or export | `#/merchant/finance` as Fulfilment role | partial | merchant/index.tsx:166; test: merchant/workspace.test.ts "restricts pages and actions by role" | Deep link renders "no access", but the data is in the client bundle; source-level blocking needs a backend. |
| EXP-QA11 | Settlement: every line explained, totals match, no mixing currencies | `#/merchant/finance/payouts/<id>` | working (simulated) | merchant/finance-page.tsx:97-141; test: merchant/finance.test.ts "collected − fees − refunds ± adjustments = net, and matches the paid amount" | Single currency (SAR) only. |
| EXP-QA12 | Assistant proposes a price/campaign change: evidence, scope, cost, preview, confirm, permission, log | `#/merchant`, `#/merchant/analytics` | partial | merchant/assistant.tsx:19-214 | Fixed questions only; proposes a transfer draft or a coupon draft with preview, confirmation and role check; no price change and no execution log. |
| EXP-QA13 | Arabic mobile purchase: variant, bag, address, test payment, confirmation in a test environment | `#/store/p/<id>` → `#/store/cart` → `#/store/checkout` → `#/store/order/<ref>` | working (simulated) | storefront/pages/Checkout.tsx:18-401; docs/lak-experience/evidence/journeys-results.txt | Payment outcome simulated. |
| EXP-QA14 | Mixed date/currency/language: identifier direction, time, periods and formats correct, no truncation | all surfaces | partial | merchant/orders.tsx:84; src/core/format.ts:1-13 | bdi/dir on identifiers throughout; only SAR fixtures, so mixed currency is untested. |
| EXP-QA15 | Failed command or provider down: actionable message, input kept, safe retry | `#/merchant/orders/<ref>` | working (simulated) | merchant/order.tsx:160-225; test: merchant/domain.test.ts "keeps the order untouched when the carrier is down, and logs the failure" | Outage is a test checkbox. |
| EXP-QA16 | Switch store then a deferred request from the previous store: no mixed state/cache/results | — | not built | — | Single demo store; no store switcher. |
| EXP-QA17 | Notification/deep link after session expiry: sign in, then safe return to authorised context | — | not built | — | No sessions or login exist. |
| EXP-QA18 | Plan/feature change: limit, cost and effect shown before change, earlier data not hidden | `#/merchant/finance?tab=billing`, `#/admin/stores/<id>` | partial | merchant/finance-page.tsx:229-248; admin/screens/stores.tsx:251-285 | Gains, losses and seat warning shown; cost is "to be approved". |
| EXP-QA19 | Admin reviews KYC then suspends a store: reason, permission, impact, log; data kept; no impersonation | `#/admin/kyc/<id>`, `#/admin/stores/<id>`, `#/admin/audit` | working (simulated) | admin/screens/kyc.tsx:136-168; admin/screens/stores.tsx:193-225; test: admin/domain.test.ts "suspends an active store, keeping its data and recording the reason" |  |
| EXP-QA20 | Update a plan for an old subscriber: version, price, effective date, renewal rules, no hidden contract change | — | deferred: decision needed | — | No plan versions or prices exist; waits on pricing decision. |
| EXP-QA21 | App Maker: build succeeds but the store rejects: both states separate, no "published" claim | `#/appmaker/releases/<id>` | working (simulated) | appmaker/index.tsx:771-905; test: appmaker/domain.test.ts "QA21: a successful build then an Apple rejection is never shown as published" |  |
| EXP-QA22 | Two products from two merchants in the marketplace: seller identity, approved cart/shipping/payment model, no mixed balances | `#/market/cart`, `#/market/checkout/<seller>` | working (simulated) | market/index.tsx:429-626; test: market/domain.test.ts "checks out one seller only and leaves the other in the cart" | Interim per-seller checkout; unified cart awaits decision. |
| EXP-QA23 | Wholesale order with quantity, limits and special price: eligibility, server price, stock, channel in merchant dashboard | — | not built | — |  |
| EXP-QA24 | External ad campaign: authorisation, budget, fees, preview; no spend in a design test | — | not built | — | Only the `#/site/ads` copy page. |
| EXP-NN01 | No inert primary actions, fake links, fake AI chat, invented sales results or unmarked demo data | all surfaces | partial | src/App.tsx:73; v2/home.tsx:80; v2/home.tsx:313-334 | Demo tag and "simulated" labels are present, but v2's primary "New product" button opens existing product p1, and v2 home shows an invented (labelled) monthly target. |
| EXP-NN02 | Separate payment, fulfilment, delivery, return and refund states | merchant, storefront, v2 | working (simulated) | merchant/domain.ts:8-9; merchant/order.tsx:46-50; test: storefront/domain.test.ts "keeps payment, fulfilment and shipment separate and collects COD on delivery" |  |
| EXP-NN03 | Preserve edits, filters, selection and context through errors and navigation | merchant, v2, storefront | partial | merchant/orders.tsx:39-48; merchant/product-editor.tsx:284-290; src/core/store.ts:3-7 | Filters in URL, leave-guard in editor, session-persisted fixtures; bulk selection is component state and is cleared on navigation. |
| EXP-NN04 | RTL/LTR, mixed identifiers, keyboard access, readable Arabic, complete mobile tasks | all surfaces | partial | src/App.tsx:61; merchant/index.tsx:90-98; docs/lak-experience/STATUS.md | Skip link, bdi, keyboard shortcuts, mobile layouts; screen reader, 200 % zoom and contrast checks are listed as not tested. |
| EXP-NN05 | Neutral operational surfaces, purposeful brand colour, no gradients on every card | merchant, v2 | partial | v2/index.tsx:68; v2/home.tsx:323 | Merchant workspace is neutral; v2 adds a background glow and gradient chart/ring. |
| EXP-NN06 | Authorization and financial calculations server-side; UI hiding and storage are not permission/ledger systems | — | backend required | src/core/store.ts:3-7; merchant/index.tsx:196 | Everything is client-side by construction; the code says so. |
| EXP-NN07 | Preview scope, cost and consequences before financial, bulk, publishing or messaging operations, with permission and confirmation | merchant, admin | working (simulated) | merchant/orders.tsx:166-190; merchant/order.tsx:372-380; merchant/storefront.tsx:69; admin/screens/reports.tsx:82-94 | Permissions are UI-only. |
| EXP-NN08 | Ground AI in authorised data with source, freshness, preview and auditable execution | `#/merchant`, `#/merchant/analytics` | partial | merchant/assistant.tsx:51-62; merchant/assistant.tsx:140-160 | Source and period shown; fixed questions computed from fixtures; no audit record of executed proposals. |
| EXP-NN09 | Do not modify production, publish, message customers, refund or migrate data to demonstrate a design | all surfaces | working (simulated) | src/App.tsx:31-33; src/core/store.ts:3-7 | No backend exists; every external effect is a labelled simulation. |
| EXP-NN10 | Do not claim secure, compliant, production-ready or faster than competitors | site, merchant | working (simulated) | site/home.tsx:224-239; merchant/settings.tsx:375; site/content.ts:348-354 | Legal pages are placeholders; policies screen disclaims compliance. |
| EXP-ST01 | Screen states: loading, empty, no results, error, partial, stale, unauthorised (ch. 01 screen contract) | `#/v2/*` (review bar), merchant, admin | partial | v2/index.tsx:129-153; v2/product.tsx:33-50; merchant/index.tsx:166 | v2 can force loading/empty/error for review; "stale" and real loading never occur elsewhere because data is synchronous fixtures. |
| EXP-ST02 | Screen contract documented per screen (ID, route, persona, data source, states, backend dependency, acceptance) | docs | partial | docs/lak-experience/STATUS.md | Route list and status per surface exist; no per-screen contract table. |

## Cross-cutting observations

| # | Area | Observation |
|---|---|---|
| 1 | Totals | Declared 27+47+244+64+36+49 = 467; registered feature rows = 411. P06 declares 49 but its four groups declare 21 |
| 2 | Duplicates | Assign Order to Staff (P03-ORD) and Assign Orders to Staff (P03-STF); Abandoned Cart Reminders (P03-ORD) and Abandoned Cart Email / SMS (P03-EMS); Customer Back-in-Stock Subscribe (P03-INV) and Back-in-Stock Alert (P03-EMS); Pickup Location Setup (P03-STP) and Pickup Locations (P03-SHP); P03 Marketing — Ads and P06 Lak Ads; P05 App Features — Customer and P05 In-App Shopping |
| 3 | BNPL | P04 Payment row names "Tabby or Tamara" only; P03 Payment Setup also has Madfu, Emkan, MIS Pay |
| 4 | Cross-store data | Flag Non-Serious Customer (Lak-wide warning) and Unified Account (Cross-Store) share customer data between merchants; Privacy Policy row claims GDPR/PDPL compliance |
| 5 | Connect Carriers | Row text "based on Time & Material" is unclear in source |
| 6 | Free Subdomain | Row text is the placeholder "platform.com/slug" |
| 7 | App review | "Submit for Lak Review — 2–7 day review window" has no matching P02 Super Admin row |
| 8 | Ecosystem | P06 intro names Wholesale, Ads, POS, Enterprise, App/Theme stores, Academy, Community; only Marketplace, Wholesale, Ads and Community have rows |
| 9 | PDF page 47 | Footer only; no content |
