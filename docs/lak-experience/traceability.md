# LAK Build Blueprint — Requirements Traceability Register

Source: chapter 09 of `LAK_Claude_Experience_Skill.md` (text extraction of the 47-page "LAK Platform — Complete Build Blueprint" PDF). Feature names are the original English names. Counts in the source are declarations, not evidence of implementation. Where table formatting is ambiguous, the original PDF governs.

ID format: `BP-<project>-<group>-<seq>`. Status is `not started` for every row until the lead updates it.

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

Declared: 27 features. PDF pages 02–06. No ACCESS column in source (public marketing site).

### P01-HOM — Marketing Homepage (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-HOM-001 | 03 | Marketing Homepage | Hero Section | AR/EN headline, CTA: Register / Demo, stats | n/a | not started |
| BP-P01-HOM-002 | 03 | Marketing Homepage | Feature Sections | Animated: Payments, Shipping, Design, Marketing, Analytics, App Maker | n/a | not started |
| BP-P01-HOM-003 | 03 | Marketing Homepage | Promo Banners | Marketplace promotion with App Store / Play links | n/a | not started |
| BP-P01-HOM-004 | 03 | Marketing Homepage | Merchant Testimonials Carousel | Rotating merchant success quotes | n/a | not started |
| BP-P01-HOM-005 | 03 | Marketing Homepage | Sector Browsing Tiles | Fashion, Beauty, Electronics, Food, Jewelry, Home, Digital, Charity... | n/a | not started |
| BP-P01-HOM-006 | 03 | Marketing Homepage | Live Stats Block | Active stores counter, countries supported | n/a | not started |

### P01-NAV — Navigation (declared 3)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-NAV-001 | 03 | Navigation | Primary Nav (AR/EN) | Language switcher, Login, Register CTA, main nav links | n/a | not started |
| BP-P01-NAV-002 | 03 | Navigation | Footer Mega Nav | Full sitemap in footer — all sections | n/a | not started |
| BP-P01-NAV-003 | 03 | Navigation | Lak Products Footer | App Maker, Theme Store, etc. | n/a | not started |

### P01-PLN — Plans Page (declared 3)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-PLN-001 | 04 | Plans Page | Plan Comparison Table | Basic / Plus / Pro / Special — full feature matrix | n/a | not started |
| BP-P01-PLN-002 | 04 | Plans Page | Annual vs Monthly Toggle | Price toggle with savings callout | n/a | not started |
| BP-P01-PLN-003 | 04 | Plans Page | FAQ Section | Common pricing questions and answers | n/a | not started |

### P01-PAY — Payment Service Page (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-PAY-001 | 04 | Payment Service Page | Payment Features | Gateways, currencies, fraud detection | n/a | not started |

### P01-MKT — Marketing Service Page (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-MKT-001 | 04 | Marketing Service Page | Marketing Features | Lak Ads, influencer platform, loyalty, affiliate, SEO tools | n/a | not started |

### P01-ADS — Ads Page (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-ADS-001 | 04 | Ads Page | Ads Platform Landing | Google, TikTok, Snapchat, Meta, X campaign management | n/a | not started |

### P01-HLP — Help Center (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-HLP-001 | 05 | Help Center | Knowledge Base | Searchable articles, video tutorials, topic categories | n/a | not started |

### P01-BLG — Blog (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-BLG-001 | 05 | Blog | Blog / Articles | Arabic & English posts, categories, comments, related articles | n/a | not started |

### P01-SUC — Success Stories (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-SUC-001 | 05 | Success Stories | Merchant Cases | Brand spotlights with growth metrics | n/a | not started |

### P01-GDE — Marketing Guide (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-GDE-001 | 05 | Marketing Guide | Store Marketing Guide | Public interactive guide for marketing a Lak store | n/a | not started |

### P01-LGL — Contact / Legal (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-LGL-001 | 05 | Contact / Legal | Contact Us | Phone, Email, Address, Issue report | n/a | not started |
| BP-P01-LGL-002 | 05 | Contact / Legal | Terms of Service | Full ToS AR/EN | n/a | not started |
| BP-P01-LGL-003 | 05 | Contact / Legal | Privacy Policy | GDPR/PDPL compliant privacy page AR/EN | n/a | not started |
| BP-P01-LGL-004 | 06 | Contact / Legal | Affiliate Agreement | Marketing affiliate ToS | n/a | not started |

> Count mismatch: header declares 6, 4 rows present in source (2 missing). Missing rows are not invented here.
> Note: Group description also names an external complaints subdomain and a VAT certificate; neither appears as a row (page break 05→06).

### P01-ABT — About / Company (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P01-ABT-001 | 06 | About / Company | About US Content | About Lak | n/a | not started |

## P02 — Super Admin Dashboard

Declared: 47 features. PDF pages 06–11. No ACCESS column in source; project intro states all actions are admin-only and audit-logged.

### P02-PLT — Platform Management (declared 4)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P02-PLT-001 | 06 | Platform Management | Admin Login (2FA) | Secure super-admin login | Admin only | not started |
| BP-P02-PLT-002 | 06 | Platform Management | Super Dashboard | Platform-wide KPIs: GMV, active stores, revenue, MRR, ARR | Admin only | not started |
| BP-P02-PLT-003 | 06 | Platform Management | Monitor Platform KPIs | Real-time counters: stores, orders, payments, errors | Admin only | not started |
| BP-P02-PLT-004 | 06 | Platform Management | Audit Activity Log | Full trail of all admin actions | Admin only | not started |

### P02-MER — Merchant Management (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P02-MER-001 | 07 | Merchant Management | Review Registrations | Pending merchant applications queue | Admin only | not started |
| BP-P02-MER-002 | 07 | Merchant Management | Approve / Reject Merchants | KYC document review and decision | Admin only | not started |
| BP-P02-MER-003 | 07 | Merchant Management | Suspend / Reactivate Merchants | Temporary or permanent account actions | Admin only | not started |
| BP-P02-MER-004 | 07 | Merchant Management | Manage Merchant Plans | Upgrade, downgrade, override plan manually | Admin only | not started |
| BP-P02-MER-005 | 07 | Merchant Management | Manage Merchant Documents | Request, view, store KYC documents | Admin only | not started |
| BP-P02-MER-006 | 07 | Merchant Management | View Any Store Details | Products, orders, settings, traffic per merchant | Admin only | not started |

### P02-SUB — Subscription Management (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P02-SUB-001 | 07 | Subscription Management | Create / Edit Subscription Plans | Define feature sets, limits, pricing per plan | Admin only | not started |
| BP-P02-SUB-002 | 07 | Subscription Management | Configure Pricing (Monthly/Annual) | Regional pricing, discount rules | Admin only | not started |
| BP-P02-SUB-003 | 07 | Subscription Management | Manage Renewals | Auto-renew rules, grace periods, reminders | Admin only | not started |
| BP-P02-SUB-004 | 07 | Subscription Management | Manage Billing & Invoices | Failed payments, retry logic, invoice history | Admin only | not started |
| BP-P02-SUB-005 | 07–08 | Subscription Management | Revenue Dashboard | MRR, ARR, churn rate, plan distribution | Admin only | not started |

### P02-STO — Store Management (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P02-STO-001 | 08 | Store Management | View All Stores (Searchable) | Filterable list of all stores | Admin only | not started |
| BP-P02-STO-002 | 08 | Store Management | Suspend Store | Remove store from public (data preserved) | Admin only | not started |
| BP-P02-STO-003 | 08 | Store Management | Reactivate Store | Restore suspended store | Admin only | not started |
| BP-P02-STO-004 | 08 | Store Management | Manage Store Domains | DNS, verification, transfer management | Admin only | not started |
| BP-P02-STO-005 | 08 | Store Management | Monitor Store Activity | Traffic, orders, errors per store | Admin only | not started |

### P02-PAY — Payment Management (declared 4)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P02-PAY-001 | 08 | Payment Management | Manage Payment Gateways | Configure available gateways per region/plan | Admin only | not started |
| BP-P02-PAY-002 | 08 | Payment Management | Monitor Transactions | Platform-wide ledger, fraud flags, chargebacks | Admin only | not started |
| BP-P02-PAY-003 | 08 | Payment Management | Handle Payment Issues | Disputes, chargebacks, refund escalations | Admin only | not started |
| BP-P02-PAY-004 | 08 | Payment Management | ZATCA Configuration | E-invoicing endpoint configuration per region | Admin only | not started |

### P02-SHP — Shipping Management (declared 4)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P02-SHP-001 | 09 | Shipping Management | Manage Shipping Providers | Carrier rates, coverage, SLA configuration | Admin only | not started |
| BP-P02-SHP-002 | 09 | Shipping Management | Configure Global Shipping Rules | Platform defaults: weight, zone, free shipping | Admin only | not started |
| BP-P02-SHP-003 | 09 | Shipping Management | Monitor Deliveries | Open shipments, failed deliveries platform-wide | Admin only | not started |
| BP-P02-SHP-004 | 09 | Shipping Management | Shipping Quality Center | Aggregate carrier complaint management | Admin only | not started |

### P02-CNT — Content Management (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P02-CNT-001 | 09 | Content Management | Manage Theme Marketplace | Approve, publish, remove themes | Admin only | not started |
| BP-P02-CNT-002 | 09 | Content Management | Manage App Marketplace | Review, approve, reject, suspend partner apps | Admin only | not started |
| BP-P02-CNT-003 | 09 | Content Management | Manage Help Center | Create/edit articles, videos, categories | Admin only | not started |
| BP-P02-CNT-004 | 09 | Content Management | Manage Static Pages | Platform terms, privacy, about | Admin only | not started |
| BP-P02-CNT-005 | 09 | Content Management | Manage Influencer Directory | Approve influencers, rates, campaigns | Admin only | not started |
| BP-P02-CNT-006 | 09 | Content Management | Blog & Community | Platform blog, community moderation | Admin only | not started |

### P02-MON — Platform Monitoring (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P02-MON-001 | 10 | Platform Monitoring | System Health Dashboard | Uptime, response times, error rates per service | Admin only | not started |
| BP-P02-MON-002 | 10 | Platform Monitoring | API Usage Monitor | Call volumes, rate limits, partner traffic | Admin only | not started |
| BP-P02-MON-003 | 10 | Platform Monitoring | Storage Usage | Object storage consumption per merchant | Admin only | not started |
| BP-P02-MON-004 | 10 | Platform Monitoring | Security Logs | Failed logins, suspicious IPs, threat detection | Admin only | not started |
| BP-P02-MON-005 | 10 | Platform Monitoring | Audit User Activities | Per-merchant-user full action log | Admin only | not started |

### P02-RPT — Reporting (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P02-RPT-001 | 10 | Reporting | Merchant Reports | Per-merchant revenue, activity, tickets | Admin only | not started |
| BP-P02-RPT-002 | 10 | Reporting | Revenue Reports | Platform-wide revenue by plan, region, period | Admin only | not started |
| BP-P02-RPT-003 | 10 | Reporting | Subscription Reports | Signups, cancellations, upgrades, downgrades | Admin only | not started |
| BP-P02-RPT-004 | 10 | Reporting | Platform Sales Reports | GMV, category performance, top merchants | Admin only | not started |
| BP-P02-RPT-005 | 10 | Reporting | Growth Analytics | MoM growth KPIs, forecast | Admin only | not started |
| BP-P02-RPT-006 | 10 | Reporting | Export All Reports | CSV/Excel download for any report | Admin only | not started |

### P02-NTF — Notification Management (declared 2)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P02-NTF-001 | 11 | Notification Management | Platform Announcements | In-app updates/alerts to all or selected merchants | Admin only | not started |
| BP-P02-NTF-002 | 11 | Notification Management | Maintenance Notifications | Scheduled downtime communications | Admin only | not started |

## P03 — Merchant Dashboard

Declared: 244 features. PDF pages 11–30. Source states 24 modules; 24 groups found. Sum of declared group counts = 244.

### P03-ACC — Account (declared 14)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-ACC-001 | 11 | Account | Register — Individual | Personal info, email/mobile, OTP verification | All plans | not started |
| BP-P03-ACC-002 | 11 | Account | Register — Corporate | CR number, trade license, VAT, company docs upload | All plans | not started |
| BP-P03-ACC-003 | 11 | Account | Register — Sole Proprietorship | Individual CR + personal ID | All plans | not started |
| BP-P03-ACC-004 | 11 | Account | Register — Charity | Charity registration + government approvals | All plans | not started |
| BP-P03-ACC-005 | 11 | Account | Login / OTP | Email or mobile + password or OTP | All plans | not started |
| BP-P03-ACC-006 | 12 | Account | Forgot / Change Password | SMS/email reset flow | All plans | not started |
| BP-P03-ACC-007 | 12 | Account | 2FA Management | Enable/disable TOTP or SMS 2FA | All plans | not started |
| BP-P03-ACC-008 | 12 | Account | Registered Devices | View and revoke sessions per device | All plans | not started |
| BP-P03-ACC-009 | 12 | Account | Sign Out All Devices | Force logout from all active sessions | All plans | not started |
| BP-P03-ACC-010 | 12 | Account | Activity Log | Timestamped log of all account actions | All plans | not started |
| BP-P03-ACC-011 | 12 | Account | Profile Editing | Name, email, mobile, avatar update | All plans | not started |
| BP-P03-ACC-012 | 12 | Account | Dark Mode Toggle | System/manual dark mode switch | All plans | not started |
| BP-P03-ACC-013 | 12 | Account | Notification Preferences | Per-event toggle: orders, stock, wishlist, updates | All plans | not started |
| BP-P03-ACC-014 | 12 | Account | Language Preference | AR / EN admin interface language | All plans | not started |

### P03-STP — Store Setup (declared 27)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-STP-001 | 12 | Store Setup | Create Multiple Stores | Manage independent stores from one account | Pro | not started |
| BP-P03-STP-002 | 12 | Store Setup | Store Category Selection | Electronics, Fashion, Food, Home, Beauty, Digital, Dropshipping, Charity, etc. | All plans | not started |
| BP-P03-STP-003 | 12 | Store Setup | Theme Selection | Free and paid themes from Themes Marketplace | All plans | not started |
| BP-P03-STP-004 | 12 | Store Setup | Logo, Favicon, Banner | Upload store branding assets | All plans | not started |
| BP-P03-STP-005 | 12 | Store Setup | Color & Font Customization | Brand color palette and typography | All plans | not started |
| BP-P03-STP-006 | 13 | Store Setup | Homepage Sections Manager | Drag-drop: banners, featured products, categories, offers, video | All plans | not started |
| BP-P03-STP-007 | 13 | Store Setup | CSS / JS Custom Code Editor | Advanced theme code customization | Plus+ | not started |
| BP-P03-STP-008 | 13 | Store Setup | Store Preview Mode | Preview store before publishing | All plans | not started |
| BP-P03-STP-009 | 13 | Store Setup | Publish Store | Go live toggle | All plans | not started |
| BP-P03-STP-010 | 13 | Store Setup | Activate Accept Orders | Separate toggle from publish — enables ordering | All plans | not started |
| BP-P03-STP-011 | 13 | Store Setup | Order Hours | Define days/hours when store accepts orders | All plans | not started |
| BP-P03-STP-012 | 13 | Store Setup | Daily Order Limit | Maximum orders per day to prevent overload | All plans | not started |
| BP-P03-STP-013 | 13 | Store Setup | Maintenance Mode | Toggle off with custom message | All plans | not started |
| BP-P03-STP-014 | 13 | Store Setup | Free Subdomain | platform.com/slug | All plans | not started |
| BP-P03-STP-015 | 13 | Store Setup | Connect External Domain | Point existing domain via DNS | All plans | not started |
| BP-P03-STP-016 | 13 | Store Setup | Register Domain via Lak | Buy domain directly in dashboard | Plus+ | not started |
| BP-P03-STP-017 | 13 | Store Setup | Transfer Domain | Migrate domain to Lak management | Plus+ | not started |
| BP-P03-STP-018 | 13 | Store Setup | DNS Management | Edit DNS records, verify ownership | Plus+ | not started |
| BP-P03-STP-019 | 13 | Store Setup | Social Media Links | Instagram, X, TikTok, Snapchat, Facebook, LinkedIn, YouTube | All plans | not started |
| BP-P03-STP-020 | 13 | Store Setup | Info Pages (Rich Text) | Return Policy, Shipping Policy, Privacy, Terms | All plans | not started |
| BP-P03-STP-021 | 13 | Store Setup | Landing Page Builder | Dedicated campaign landing pages | Plus+ | not started |
| BP-P03-STP-022 | 13 | Store Setup | Pickup Location Setup | Physical branch pickup address definition | All plans | not started |
| BP-P03-STP-023 | 13 | Store Setup | Currency Configuration | Primary + multi-currency | All plans | not started |
| BP-P03-STP-024 | 14 | Store Setup | Language Configuration | Store front languages | All plans | not started |
| BP-P03-STP-025 | 14 | Store Setup | Timezone & Measurement Units | Regional settings: timezone, weight unit | All plans | not started |

> Count mismatch: header declares 27, 25 rows present in source (2 missing). Missing rows are not invented here.

### P03-PMT — Payment Setup (declared 23)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-PMT-001 | 14 | Payment Setup | Cash on Delivery | Enable with min/max order value limits | All plans | not started |
| BP-P03-PMT-002 | 14 | Payment Setup | Bank Transfer Details | Manual bank account display for customers | All plans | not started |
| BP-P03-PMT-003 | 14 | Payment Setup | Mada | Saudi debit card gateway | Plus+ | not started |
| BP-P03-PMT-004 | 14 | Payment Setup | Visa / Mastercard / Amex | International card processing | Plus+ | not started |
| BP-P03-PMT-005 | 14 | Payment Setup | Apple Pay | One-tap mobile payment | Plus+ | not started |
| BP-P03-PMT-006 | 14 | Payment Setup | STC Pay | Saudi mobile wallet | Plus+ | not started |
| BP-P03-PMT-007 | 14 | Payment Setup | Tabby (BNPL) | Buy Now Pay Later via Tabby | Plus+ | not started |
| BP-P03-PMT-008 | 14 | Payment Setup | Tamara (BNPL) | Buy Now Pay Later via Tamara | Plus+ | not started |
| BP-P03-PMT-009 | 14 | Payment Setup | MIS Pay | GCC mobile payment | Plus+ | not started |
| BP-P03-PMT-010 | 14 | Payment Setup | Madfu (BNPL) | Saudi BNPL provider | Plus+ | not started |
| BP-P03-PMT-011 | 14 | Payment Setup | Emkan (Installments) | Installment payment provider | Plus+ | not started |
| BP-P03-PMT-012 | 14 | Payment Setup | Mokafa | Loyalty redemption payment | Plus+ | not started |
| BP-P03-PMT-013 | 14 | Payment Setup | PayPal | International PayPal | Plus+ | not started |
| BP-P03-PMT-014 | 14–15 | Payment Setup | Bank Offers | Card-linked offers at checkout (e.g. 10% off with Bank X) | Pro | not started |
| BP-P03-PMT-015 | 15 | Payment Setup | Customer Wallet | Top-up and pay-from-wallet system | Plus+ | not started |
| BP-P03-PMT-016 | 15 | Payment Setup | Gift Cards | Issue and redeem store gift cards | Plus+ | not started |
| BP-P03-PMT-017 | 15 | Payment Setup | Cashback Configuration | Cashback eligibility rules per order status | Plus+ | not started |
| BP-P03-PMT-018 | 15 | Payment Setup | Multi-Currency Checkout | Accept payment in different currencies | Plus+ | not started |
| BP-P03-PMT-019 | 15 | Payment Setup | ZATCA / Fatoora Integration | E-invoicing compliance | All plans | not started |
| BP-P03-PMT-020 | 15 | Payment Setup | VAT / Tax Rules | Configure VAT rate, inclusive/exclusive pricing display | All plans | not started |
| BP-P03-PMT-021 | 15 | Payment Setup | PCI DSS Compliance | All transactions via PCI-compliant gateway | All plans | not started |
| BP-P03-PMT-022 | 15 | Payment Setup | AI Fraud Detection | Real-time risk scoring on all transactions | All plans | not started |
| BP-P03-PMT-023 | 15 | Payment Setup | 3-D Secure Authentication | Card 3DS layer | All plans | not started |

### P03-CHK — Checkout Settings (declared 15)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-CHK-001 | 15 | Checkout Settings | Guest Checkout | Orders without account registration | All plans | not started |
| BP-P03-CHK-002 | 15 | Checkout Settings | One-Click Buy (Returning) | Prefill from most recent order | All plans | not started |
| BP-P03-CHK-003 | 15 | Checkout Settings | Auto-Prefill Address | Last shipping address pre-selected | All plans | not started |
| BP-P03-CHK-004 | 15 | Checkout Settings | Corporate Checkout Mode | Company name, CR, VAT ID on invoice | All plans | not started |
| BP-P03-CHK-005 | 16 | Checkout Settings | Address via Map or Form | Choose input method for shipping address | All plans | not started |
| BP-P03-CHK-006 | 16 | Checkout Settings | Merge Guest Cart on Login | Combine guest and account carts | All plans | not started |
| BP-P03-CHK-007 | 16 | Checkout Settings | Display Donation Message | Optional charity message at checkout | All plans | not started |
| BP-P03-CHK-008 | 16 | Checkout Settings | Pre-Order Acknowledgement | Customer agrees to custom message before ordering | All plans | not started |
| BP-P03-CHK-009 | 16 | Checkout Settings | Post-Checkout Messages | Custom per-status: Pending / Under Review / Success | All plans | not started |
| BP-P03-CHK-010 | 16 | Checkout Settings | Customer Order Notes | Allow free-text note field | All plans | not started |
| BP-P03-CHK-011 | 16 | Checkout Settings | Self-Cancellation Window | Set time limit for customer cancellation | All plans | not started |
| BP-P03-CHK-012 | 16 | Checkout Settings | Reorder / Repurchase Button | One-click reorder from order history | All plans | not started |
| BP-P03-CHK-013 | 16 | Checkout Settings | Gift Order Option | Ship to recipient with gift message | All plans | not started |
| BP-P03-CHK-014 | 16 | Checkout Settings | COD Order Limit per Customer | Prevent abuse of cash on delivery | All plans | not started |

> Count mismatch: header declares 15, 14 rows present in source (1 missing). Missing rows are not invented here.

### P03-PRD — Products (declared 27)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-PRD-001 | 16 | Products | Create / Edit Product | Title, description, images, price, compare-price, SKU, barcode, weight | All plans | not started |
| BP-P03-PRD-002 | 16 | Products | Product Variants | Color, size, material... | All plans | not started |
| BP-P03-PRD-003 | 16 | Products | Product Types: Physical | Standard shippable product | All plans | not started |
| BP-P03-PRD-004 | 17 | Products | Product Types: Digital Download | Auto-deliver download link post-purchase | All plans | not started |
| BP-P03-PRD-005 | 17 | Products | Product Types: Bundle | Group multiple products into a bundle | All plans | not started |
| BP-P03-PRD-006 | 17 | Products | Product Types: Subscription | Recurring purchase product | Pro | not started |
| BP-P03-PRD-007 | 17 | Products | Category Tree Management | Hierarchical categories with images, SEO meta | All plans | not started |
| BP-P03-PRD-008 | 17 | Products | Brand Management | Brand logos, filter by brand | All plans | not started |
| BP-P03-PRD-009 | 17 | Products | Product Tags | Free-text tags for internal and customer filtering | All plans | not started |
| BP-P03-PRD-010 | 17 | Products | Bulk Product Editor | Mass-edit prices, quantities, status in one view | All plans | not started |
| BP-P03-PRD-011 | 17 | Products | Import Products (CSV/Excel) | Bulk upload product catalog | All plans | not started |
| BP-P03-PRD-012 | 17 | Products | Export Products (CSV) | Export full catalog | All plans | not started |
| BP-P03-PRD-013 | 17 | Products | Product Duplication | One-click duplicate any product | All plans | not started |
| BP-P03-PRD-014 | 17 | Products | 3D Product View | Interactive 3D product visualization | Pro | not started |
| BP-P03-PRD-015 | 17 | Products | Product Landing Pages | Dedicated per-product landing page | Plus+ | not started |
| BP-P03-PRD-016 | 17 | Products | SEO per Product | Custom meta title, description, URL slug | All plans | not started |
| BP-P03-PRD-017 | 17 | Products | Product Sorting Config | Recommended, Best Selling, Top Rated, Price asc/desc, Discount | All plans | not started |
| BP-P03-PRD-018 | 17 | Products | Custom Filters | Define product filter attributes | All plans | not started |
| BP-P03-PRD-019 | 17 | Products | Purchase Count Display | Show how many times product sold | All plans | not started |
| BP-P03-PRD-020 | 17 | Products | Stock Display Options | Show stock / hide / show when below X | All plans | not started |
| BP-P03-PRD-021 | 18 | Products | Out-of-Stock Behavior | Show sold-out last / allow browsing sold-out | All plans | not started |
| BP-P03-PRD-022 | 18 | Products | Price Starting From | Show lowest variant price | All plans | not started |
| BP-P03-PRD-023 | 18 | Products | Special Offer Badge | Discount badge on product card | All plans | not started |
| BP-P03-PRD-024 | 18 | Products | Tax-Inclusive Pricing | Input VAT-inclusive, show pre-VAT at checkout | All plans | not started |
| BP-P03-PRD-025 | 18 | Products | Weight Display on Product Page | Show weight, and include on invoice | All plans | not started |
| BP-P03-PRD-026 | 18 | Products | Product SKU Exclude from Inventory | Mark non-tracked SKUs | All plans | not started |

> Count mismatch: header declares 27, 26 rows present in source (1 missing). Missing rows are not invented here.
> Note: Group description names a "service" product type; no Product Types: Service row is present.

### P03-INV — Inventory (declared 7)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-INV-001 | 18 | Inventory | Create Warehouse / Branch | Multiple named warehouses | All plans | not started |
| BP-P03-INV-002 | 18 | Inventory | Real-Time Stock Tracking | Live levels per warehouse | All plans | not started |
| BP-P03-INV-003 | 18 | Inventory | Transfer Between Inventories | Move stock between branches | All plans | not started |
| BP-P03-INV-004 | 18 | Inventory | Import / Export Inventory (CSV) | Bulk stock level management | All plans | not started |
| BP-P03-INV-005 | 18 | Inventory | Low Stock Merchant Alerts | Notification below threshold | All plans | not started |
| BP-P03-INV-006 | 18 | Inventory | Customer Back-in-Stock Subscribe | Customers get notified on restock | All plans | not started |
| BP-P03-INV-007 | 19 | Inventory | Auto-Assign Warehouse by Customer City | Route orders to nearest warehouse | Pro | not started |

### P03-ORD — Orders (declared 26)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-ORD-001 | 19 | Orders | View / Filter / Search Orders | Filter by status, date, channel, carrier, tag, payment method | All plans | not started |
| BP-P03-ORD-002 | 19 | Orders | Order Detail View | Items, customer, shipping, payment, timeline | All plans | not started |
| BP-P03-ORD-003 | 19 | Orders | Confirm Order | Mark as confirmed / processing | All plans | not started |
| BP-P03-ORD-004 | 19 | Orders | Print Invoice PDF | Brand-customized invoice with VAT (ZATCA compliant) | All plans | not started |
| BP-P03-ORD-005 | 19 | Orders | Print Packing Slip | Internal packing summary | All plans | not started |
| BP-P03-ORD-006 | 19 | Orders | Create Shipment & Label | Generate label via connected carrier | All plans | not started |
| BP-P03-ORD-007 | 19 | Orders | Mark as Shipped | Update status + customer notification | All plans | not started |
| BP-P03-ORD-008 | 19 | Orders | Mark as Delivered | Close fulfillment loop | All plans | not started |
| BP-P03-ORD-009 | 19 | Orders | Track Shipment (Lak Link or Carrier) | Configurable tracking link source | All plans | not started |
| BP-P03-ORD-010 | 19 | Orders | Bulk Status Update | Change status for multiple orders | All plans | not started |
| BP-P03-ORD-011 | 19 | Orders | Assign Order to Staff | Delegate to specific team member | Pro | not started |
| BP-P03-ORD-012 | 19 | Orders | Tag Orders | Internal custom labels | All plans | not started |
| BP-P03-ORD-013 | 19 | Orders | Add Manual Order | Dashboard-created order (phone/in-person) | All plans | not started |
| BP-P03-ORD-014 | 19–20 | Orders | Edit Order Post-Creation | Modify product, shipping, customer without cancelling | All plans | not started |
| BP-P03-ORD-015 | 20 | Orders | Process Return & Refund | Initiate return, track, issue refund | All plans | not started |
| BP-P03-ORD-016 | 20 | Orders | Return & Exchange | Exchange for different product variant | All plans | not started |
| BP-P03-ORD-017 | 20 | Orders | Customer Self-Cancellation | Within merchant-defined window | All plans | not started |
| BP-P03-ORD-018 | 20 | Orders | Cashback Activation | Trigger reward on eligible order | Plus+ | not started |
| BP-P03-ORD-019 | 20 | Orders | Customer Order Notifications (Email/SMS) | Per-status notifications | All plans | not started |
| BP-P03-ORD-020 | 20 | Orders | Abandoned Cart Reminders | Auto follow-up with optional time-limited discount | All plans | not started |
| BP-P03-ORD-021 | 20 | Orders | Smart Cart Offers | Dynamic upsell during cart / checkout | Pro | not started |
| BP-P03-ORD-022 | 20 | Orders | Smart Purchase Reminder | Auto re-purchase trigger at optimal time | Pro | not started |
| BP-P03-ORD-023 | 20 | Orders | Gift Orders | Separate delivery to gift recipient | All plans | not started |
| BP-P03-ORD-024 | 20 | Orders | Shipment Complaint (Quality Center) | Submit carrier complaints from dashboard | All plans | not started |
| BP-P03-ORD-025 | 20 | Orders | Delivery Confirmation Request | Auto-ask customer to confirm receipt | All plans | not started |
| BP-P03-ORD-026 | 20 | Orders | Order Scheduling | Accept bookings with date/time slot | Pro | not started |

### P03-SHP — Shipping (declared 13)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-SHP-001 | 21 | Shipping | Shipping Zones | Country / region / city zones | All plans | not started |
| BP-P03-SHP-002 | 21 | Shipping | Flat & Weight-Based Rates | Configurable per zone | All plans | not started |
| BP-P03-SHP-003 | 21 | Shipping | Free Shipping Rules | By min spend, specific products, categories | All plans | not started |
| BP-P03-SHP-004 | 21 | Shipping | Connect Carriers | Connect multiple carriers based on Time & Material (Aramex, Nakel, Marsul...) | All plans | not started |
| BP-P03-SHP-005 | 21 | Shipping | Pickup Locations | In-store / branch pickup | All plans | not started |
| BP-P03-SHP-006 | 21 | Shipping | Express Shipping Toggle | Enable/disable express options | All plans | not started |
| BP-P03-SHP-007 | 21 | Shipping | COD Shipping Rules | Min/max order value for COD eligibility | All plans | not started |
| BP-P03-SHP-008 | 21 | Shipping | Carrier Auto-Status Update | Auto-update order from carrier when supported | All plans | not started |
| BP-P03-SHP-009 | 21 | Shipping | Single Carrier Display | Show one when rates match | All plans | not started |
| BP-P03-SHP-010 | 21 | Shipping | Send Item Details to Carrier | Product bundle sub-items in manifest | All plans | not started |
| BP-P03-SHP-011 | 21 | Shipping | Restrict Shipping by Product/Category | Hide carriers for specific products | Pro | not started |
| BP-P03-SHP-012 | 21 | Shipping | Global Shipping Fleet | Lak-negotiated discounted carrier rates | Plus+ | not started |
| BP-P03-SHP-013 | 21 | Shipping | Lak Shipping Labels | Print labels + Quality Center for complaints | Plus+ | not started |

> Note: Group header on page 20; all rows on page 21.

### P03-CUS — Customer Mgmt (declared 10)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-CUS-001 | 22 | Customer Mgmt | View / Filter Customers | By name, email, mobile, location, segment | All plans | not started |
| BP-P03-CUS-002 | 22 | Customer Mgmt | Customer Profile | Order history, LTV, reviews, addresses, wallet | All plans | not started |
| BP-P03-CUS-003 | 22 | Customer Mgmt | Block Customer | Prevent ordering by suspicious accounts | All plans | not started |
| BP-P03-CUS-004 | 22 | Customer Mgmt | Segment Customers | Group for personalized discounts / payment options | Pro | not started |
| BP-P03-CUS-005 | 22 | Customer Mgmt | Flag Non-Serious Customer | Cross-store Lak-wide warning system | All plans | not started |
| BP-P03-CUS-006 | 22 | Customer Mgmt | Import / Export Customers | Bulk CSV operations | All plans | not started |
| BP-P03-CUS-007 | 22 | Customer Mgmt | Unified Account (Cross-Store) | One Lak account works across all stores | All plans | not started |
| BP-P03-CUS-008 | 22 | Customer Mgmt | View Reviews & Respond | Approve, hide, reply to reviews | All plans | not started |
| BP-P03-CUS-009 | 22 | Customer Mgmt | View Q&A & Respond | Answer customer questions on product pages | All plans | not started |
| BP-P03-CUS-010 | 22 | Customer Mgmt | Customer Wallet View | Balance, top-up history, transactions | All plans | not started |

> Note: Group header on page 21; all rows on page 22.

### P03-CPN — Marketing — Coupons (declared 3)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-CPN-001 | 22 | Marketing — Coupons | Create Coupon Codes | %, fixed, free shipping, BOGO, min-spend conditions | All plans | not started |
| BP-P03-CPN-002 | 22 | Marketing — Coupons | Coupon Management | List, activate, deactivate, track usage stats | All plans | not started |
| BP-P03-CPN-003 | 22 | Marketing — Coupons | Bulk / Quantity Pricing | Tiered pricing for volume orders (unit price decreases as quantity rises) | Pro | not started |

### P03-LOY — Marketing — Loyalty (declared 2)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-LOY-001 | 23 | Marketing — Loyalty | Loyalty Points Program | Points earn & redeem rules | Plus+ | not started |
| BP-P03-LOY-002 | 23 | Marketing — Loyalty | Cashback Program | % cashback to store wallet on eligible orders | Plus+ | not started |

### P03-AFF — Marketing — Affiliate (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-AFF-001 | 23 | Marketing — Affiliate | Affiliate Program | Referral links, commissions, payout management | Pro | not started |

### P03-INF — Marketing — Influencer (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-INF-001 | 23 | Marketing — Influencer | Influencer Discovery & Campaigns | Search, contract, execute, track, pay influencers | Pro | not started |

### P03-ADS — Marketing — Ads (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-ADS-001 | 24 | Marketing — Ads | Lak Ads — Google / YouTube | Managed PPC (Pay-Per-Click) from Lak dashboard | Plus+ | not started |
| BP-P03-ADS-002 | 24 | Marketing — Ads | Lak Ads — TikTok | TikTok for Business campaigns | Plus+ | not started |
| BP-P03-ADS-003 | 24 | Marketing — Ads | Lak Ads — Snapchat | Snapchat Business campaigns | Plus+ | not started |
| BP-P03-ADS-004 | 24 | Marketing — Ads | Lak Ads — Meta / Instagram | Meta Business campaigns + pixel | Plus+ | not started |
| BP-P03-ADS-005 | 24 | Marketing — Ads | Lak Ads — X (Twitter) | X Ads campaigns | Plus+ | not started |
| BP-P03-ADS-006 | 24 | Marketing — Ads | UTM Link Generator | Create/track UTM campaign links | All plans | not started |

> Note: Group header on page 23; all rows on page 24.

### P03-EMS — Marketing — Email/SMS (declared 7)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-EMS-001 | 24 | Marketing — Email/SMS | Marketing Campaigns (Broadcast) | Send email/SMS to customer segments | Plus+ | not started |
| BP-P03-EMS-002 | 24 | Marketing — Email/SMS | Welcome Message Automation | Auto-send welcome to new subscribers | All plans | not started |
| BP-P03-EMS-003 | 24 | Marketing — Email/SMS | Abandoned Cart Email / SMS | Auto follow-up with optional discount | All plans | not started |
| BP-P03-EMS-004 | 24 | Marketing — Email/SMS | Wishlist Price Drop Alert | Notify on price reduction | All plans | not started |
| BP-P03-EMS-005 | 24 | Marketing — Email/SMS | Back-in-Stock Alert | Notify wishlist subscribers on restock | All plans | not started |
| BP-P03-EMS-006 | 24 | Marketing — Email/SMS | Wishlist Stock Low Alert | Alert when low on wishlist item | All plans | not started |
| BP-P03-EMS-007 | 24–25 | Marketing — Email/SMS | Wishlist 14-Day Reminder | Remind customers of saved items | All plans | not started |

### P03-SEO — Marketing — SEO (declared 4)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-SEO-001 | 25 | Marketing — SEO | Homepage & Global SEO | Meta title/desc, robots.txt, sitemap.xml | All plans | not started |
| BP-P03-SEO-002 | 25 | Marketing — SEO | Per-Page SEO (Products/Categories) | Custom meta, canonical, URL slug per page | All plans | not started |
| BP-P03-SEO-003 | 25 | Marketing — SEO | Blog Module | Publish SEO articles, categories, tags, comments | All plans | not started |
| BP-P03-SEO-004 | 25 | Marketing — SEO | llms.txt (AI-friendly content) | Machine-readable brand page | All plans | not started |

### P03-MAN — Marketing — Analytics (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-MAN-001 | 25 | Marketing — Analytics | Google Analytics 4 | GA4 setup and event tracking | All plans | not started |
| BP-P03-MAN-002 | 25 | Marketing — Analytics | Facebook Pixel | Conversion tracking for Meta ads | All plans | not started |
| BP-P03-MAN-003 | 25 | Marketing — Analytics | TikTok Pixel | Conversion tracking for TikTok ads | All plans | not started |
| BP-P03-MAN-004 | 25 | Marketing — Analytics | Google Tag Manager | GTM container injection | All plans | not started |
| BP-P03-MAN-005 | 25 | Marketing — Analytics | Hotjar | Heatmaps and session recording | All plans | not started |

### P03-SOC — Marketing — Social (declared 2)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-SOC-001 | 26 | Marketing — Social | WhatsApp Business API | Auto order confirmations via WhatsApp | All plans | not started |
| BP-P03-SOC-002 | 26 | Marketing — Social | Social Media Links in Store | Follow icons in storefront | All plans | not started |

> Note: Group header on page 25; rows on page 26.

### P03-REV — Reviews & Q&A (declared 13)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-REV-001 | 26 | Reviews & Q&A | Enable Product / Store / Shipping Reviews | Per-type review toggle | All plans | not started |
| BP-P03-REV-002 | 26 | Reviews & Q&A | Auto-Publish or Moderate Reviews | Skip or require approval | All plans | not started |
| BP-P03-REV-003 | 26 | Reviews & Q&A | Hide Customer Name (Masking) | M* A**** name masking | All plans | not started |
| BP-P03-REV-004 | 26 | Reviews & Q&A | Photo Reviews | Image attachment in reviews | All plans | not started |
| BP-P03-REV-005 | 26 | Reviews & Q&A | Review Likes | Helpful/not helpful vote | All plans | not started |
| BP-P03-REV-006 | 26 | Reviews & Q&A | Customer Edit / Delete Review | Post-submission editing | All plans | not started |
| BP-P03-REV-007 | 26 | Reviews & Q&A | Thank You Message on Review | Custom post-review message | All plans | not started |
| BP-P03-REV-008 | 26 | Reviews & Q&A | Product Q&A | Customer questions on product pages | All plans | not started |
| BP-P03-REV-009 | 26 | Reviews & Q&A | Info Page Q&A | Questions on static info pages | All plans | not started |
| BP-P03-REV-010 | 26 | Reviews & Q&A | Auto-Publish Questions | No moderation for questions | All plans | not started |
| BP-P03-REV-011 | 27 | Reviews & Q&A | Restrict Guest Questions | Only registered users post questions | All plans | not started |
| BP-P03-REV-012 | 27 | Reviews & Q&A | Show Rating on Category Page | Aggregated rating on category cards | All plans | not started |
| BP-P03-REV-013 | 27 | Reviews & Q&A | Share Review Request Link | Merchant sends post-purchase link | All plans | not started |

### P03-STF — Staff Management (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-STF-001 | 27 | Staff Management | Create Staff Accounts | Add team members by email/mobile | All plans | not started |
| BP-P03-STF-002 | 27 | Staff Management | Assign Staff Roles | Predefined or custom roles | Pro | not started |
| BP-P03-STF-003 | 27 | Staff Management | Granular RBAC Permissions | Per-module access control | Pro | not started |
| BP-P03-STF-004 | 27 | Staff Management | Staff Activity Log | Audit trail per team member | Pro | not started |
| BP-P03-STF-005 | 27 | Staff Management | Assign Orders to Staff | Order-level delegation | Pro | not started |

### P03-ANA — Analytics (declared 12)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-ANA-001 | 27 | Analytics | Performance Dashboard | Gross/Net Sales, Discounts, COGS, Shipping, Fees, Net Profit | All plans | not started |
| BP-P03-ANA-002 | 27–28 | Analytics | Sales Dashboard | Orders, AOV, Repeat Rate, Return Rate, Sales by Channel | Pro | not started |
| BP-P03-ANA-003 | 28 | Analytics | Products Reports | Top selling, most profitable, abandoned, wishlist, returned | Pro | not started |
| BP-P03-ANA-004 | 28 | Analytics | Customers Reports | New vs returning, top spenders, satisfaction score, age/gender | Pro | not started |
| BP-P03-ANA-005 | 28 | Analytics | Visits Analytics | Traffic sources, keywords, top cities, browser, most visited pages | All plans | not started |
| BP-P03-ANA-006 | 28 | Analytics | Payments Analytics | Gateway breakdown, suspicious rate, chargeback rate | All plans | not started |
| BP-P03-ANA-007 | 28 | Analytics | Shipping Analytics | Avg delivery time, carrier performance, top cities | Pro | not started |
| BP-P03-ANA-008 | 28 | Analytics | Inventory Analytics | Stock availability, back-in-stock requests, wishlist adds | All plans | not started |
| BP-P03-ANA-009 | 28 | Analytics | Coupons Reports | Usage, revenue impact per coupon | Pro | not started |
| BP-P03-ANA-010 | 28 | Analytics | Abandoned Cart Reports | Lost revenue, recovered carts, most abandoned products | Pro | not started |
| BP-P03-ANA-011 | 28 | Analytics | Export All Reports (CSV/Excel) | Download any dataset | Pro | not started |

> Count mismatch: header declares 12, 11 rows present in source (1 missing). Missing rows are not invented here.
> Note: Group description says twelve dashboards "topped with AI-powered smart insights"; no smart-insights row is present.

### P03-SUP — Support (In-Dashboard) (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-SUP-001 | 28 | Support (In-Dashboard) | Live Chat with Support | Real-time Lak team support | All plans | not started |
| BP-P03-SUP-002 | 28 | Support (In-Dashboard) | Global Search | Search orders, products, customers across dashboard | All plans | not started |
| BP-P03-SUP-003 | 28–29 | Support (In-Dashboard) | Contextual Help Articles | Per-page embedded help links | All plans | not started |
| BP-P03-SUP-004 | 29 | Support (In-Dashboard) | Video Tutorials | Embedded how-to videos | All plans | not started |

> Count mismatch: header declares 5, 4 rows present in source (1 missing). Missing rows are not invented here.
> Note: Group description names an AI assistant for natural-language store management; no such row is present.

### P03-CHN — Sales Channels (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-CHN-001 | 29 | Sales Channels | Lak Marketplace (Auto) | Products auto-listed — no setup needed | All plans | not started |
| BP-P03-CHN-002 | 29 | Sales Channels | App Maker (iOS & Android) | Build and publish branded mobile app (add-on) | Plus+ | not started |

> Count mismatch: header declares 6, 2 rows present in source (4 missing). Missing rows are not invented here.
> Note: Group description also names the Lak Wholesale B2B channel and TikTok/Snapchat catalog sync; no rows are present for them.

### P03-SET — Settings (declared 10)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P03-SET-001 | 29 | Settings | Product Settings | Display, inventory, wishlist, notification behavior settings | All plans | not started |
| BP-P03-SET-002 | 29 | Settings | Order Settings | Post-checkout messages, limits, hours, cancellation | All plans | not started |
| BP-P03-SET-003 | 29 | Settings | Shipping Settings | COD rules, carrier auto-update, warehouse routing | All plans | not started |
| BP-P03-SET-004 | 29 | Settings | Customer Settings | Registration optional, address method, cart merge | All plans | not started |
| BP-P03-SET-005 | 29 | Settings | Marketing Settings | Coupon rules, welcome message, free product criteria | All plans | not started |
| BP-P03-SET-006 | 29 | Settings | Review Settings | All review and Q&A configuration options | All plans | not started |
| BP-P03-SET-007 | 29 | Settings | Notification Settings | Per-event merchant notification toggles | All plans | not started |
| BP-P03-SET-008 | 29 | Settings | Tax / VAT Settings | Rate, inclusive/exclusive, ZATCA configuration | All plans | not started |
| BP-P03-SET-009 | 30 | Settings | Currency & Exchange Rates | Primary + secondary, auto/manual rates | All plans | not started |
| BP-P03-SET-010 | 30 | Settings | Balance & Billing | Subscription payment method, invoices, billing details | All plans | not started |

## P04 — Merchant Storefront

Declared: 64 features. PDF pages 30–35. No ACCESS column in source; availability follows the merchant's plan (see P03 gates).

### P04-DIS — Discovery (declared 3)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P04-DIS-001 | 30 | Discovery | Browse Lak Marketplace | Browse products across multiple stores | not stated | not started |
| BP-P04-DIS-002 | 30 | Discovery | Direct Store URL | Custom domain | not stated | not started |

> Count mismatch: header declares 3, 2 rows present in source (1 missing). Missing rows are not invented here.
> Note: Group description names a third path (social and ad traffic); no row is present for it.

### P04-BRW — Browsing (declared 11)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P04-BRW-001 | 30 | Browsing | Homepage | Themed: banners, featured products, categories, offers, video | not stated | not started |
| BP-P04-BRW-002 | 30 | Browsing | Category Pages | Filters, sort, aggregated ratings | not stated | not started |
| BP-P04-BRW-003 | 30 | Browsing | Brand Pages | Products filtered by brand | not stated | not started |
| BP-P04-BRW-004 | 31 | Browsing | Product Search | Full-text search, autocomplete, filters | not stated | not started |
| BP-P04-BRW-005 | 31 | Browsing | Product Detail Page | Image carousel, description, variants, price, stock, reviews, Q&A, shipping ETA | not stated | not started |
| BP-P04-BRW-006 | 31 | Browsing | 3D Product View | Interactive 360 model (Pro merchant stores) | Pro (per row text) | not started |
| BP-P04-BRW-007 | 31 | Browsing | Related Products Section | 'You may also like' recommendations | not stated | not started |
| BP-P04-BRW-008 | 31 | Browsing | Wishlist Add / Remove | Save for later, get alerts | not stated | not started |
| BP-P04-BRW-009 | 31 | Browsing | Product Q&A | Post and read questions/answers | not stated | not started |
| BP-P04-BRW-010 | 31 | Browsing | Info Pages | Return policy, shipping policy, privacy, terms | not stated | not started |
| BP-P04-BRW-011 | 31 | Browsing | Blog Articles | Merchant-published content | not stated | not started |

### P04-ACC — Account (declared 9)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P04-ACC-001 | 31 | Account | Register (Email/Mobile + OTP) | Account creation with verification | not stated | not started |
| BP-P04-ACC-002 | 31 | Account | Login (Password or OTP) | Flexible login options | not stated | not started |
| BP-P04-ACC-003 | 31 | Account | Profile Edit | Name, email, mobile, avatar | not stated | not started |
| BP-P04-ACC-004 | 31 | Account | Address Book (Multiple Addresses) | Map or form entry, multiple saved addresses | not stated | not started |
| BP-P04-ACC-005 | 31 | Account | Order History & Status | All past orders with re-order button | not stated | not started |
| BP-P04-ACC-006 | 31 | Account | Wishlist Management | View, remove, receive alerts | not stated | not started |
| BP-P04-ACC-007 | 31 | Account | Wallet / Balance | View balance, top-up, transaction history | not stated | not started |
| BP-P04-ACC-008 | 32 | Account | Loyalty Points View | Earned points, redemption options | not stated | not started |
| BP-P04-ACC-009 | 32 | Account | Notifications Inbox | All email/SMS triggered events | not stated | not started |

### P04-CRT — Cart (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P04-CRT-001 | 32 | Cart | Add to Cart | Variant selection + quantity add | not stated | not started |
| BP-P04-CRT-002 | 32 | Cart | Modify Cart | Quantity adjust, remove items | not stated | not started |
| BP-P04-CRT-003 | 32 | Cart | Apply Coupon Code | Discount code field | not stated | not started |
| BP-P04-CRT-004 | 32 | Cart | Gift Wrap / Message | Mark as gift, add message | not stated | not started |

> Count mismatch: header declares 6, 4 rows present in source (2 missing). Missing rows are not invented here.
> Note: Group description names smart upsell offers and an estimated shipping preview; no rows are present for them.

### P04-CHK — Checkout (declared 9)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P04-CHK-001 | 32 | Checkout | Guest Checkout (No Account) | Place order without registering | not stated | not started |
| BP-P04-CHK-002 | 32 | Checkout | Shipping Address (Map or Form) | Enter via map pin or manual form | not stated | not started |
| BP-P04-CHK-003 | 32 | Checkout | Select Shipping Method | Available carriers and rates | not stated | not started |
| BP-P04-CHK-004 | 32 | Checkout | Select Payment Method | Online / COD / Wallet / BNPL / Gift Card | not stated | not started |
| BP-P04-CHK-005 | 32 | Checkout | One-Click Buy (Returning Customer) | Prefill from last order | not stated | not started |
| BP-P04-CHK-006 | 33 | Checkout | Review Order Summary | Items, subtotal, VAT, discount, shipping, total | not stated | not started |
| BP-P04-CHK-007 | 33 | Checkout | Corporate Checkout | Company name, CR, VAT ID for B2B invoice | not stated | not started |
| BP-P04-CHK-008 | 33 | Checkout | Pre-Order Acknowledgement | Custom merchant message agreement | not stated | not started |

> Count mismatch: header declares 9, 8 rows present in source (1 missing). Missing rows are not invented here.
> Note: Group description mentions "booking variations"; no booking row is present.

### P04-PAY — Payment (declared 9)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P04-PAY-001 | 33 | Payment | Complete Online Payment | Secure gateway redirect or embedded form | not stated | not started |
| BP-P04-PAY-002 | 33 | Payment | COD Confirmation | Instant order confirmation, pay on delivery | not stated | not started |
| BP-P04-PAY-003 | 33 | Payment | Bank Transfer + Slip Upload | Upload transfer confirmation | not stated | not started |
| BP-P04-PAY-004 | 33 | Payment | Wallet Payment | Deduct from store wallet balance | not stated | not started |
| BP-P04-PAY-005 | 33 | Payment | BNPL (Tabby or Tamara) | Select instalment plan at checkout | not stated | not started |
| BP-P04-PAY-006 | 33 | Payment | Gift Card Redemption | Apply gift card at checkout | not stated | not started |
| BP-P04-PAY-007 | 33 | Payment | Order Confirmation (Email + SMS) | Instant post-checkout notification | not stated | not started |
| BP-P04-PAY-008 | 33 | Payment | Receive PDF Invoice | VAT-compliant ZATCA invoice | not stated | not started |
| BP-P04-PAY-009 | 33 | Payment | Wallet Top-Up | Add funds via payment gateway | not stated | not started |

### P04-PST — Post-Order (declared 11)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P04-PST-001 | 34 | Post-Order | Track Shipment | Click tracking link in notification or order page | not stated | not started |
| BP-P04-PST-002 | 34 | Post-Order | View Real-Time Order Status | Confirmed → Shipped → Out for Delivery → Delivered | not stated | not started |
| BP-P04-PST-003 | 34 | Post-Order | Receive Delivery Notification | Email + SMS when delivered | not stated | not started |
| BP-P04-PST-004 | 34 | Post-Order | Confirm Delivery | Mark as received | not stated | not started |
| BP-P04-PST-005 | 34 | Post-Order | Rate Product (Star + Text + Photo) | 1–5 star product review | not stated | not started |
| BP-P04-PST-006 | 34 | Post-Order | Rate Store Experience | Overall store rating | not stated | not started |
| BP-P04-PST-007 | 34 | Post-Order | Rate Shipping Carrier | Carrier service rating | not stated | not started |
| BP-P04-PST-008 | 34 | Post-Order | Request Return | Initiate return from order page | not stated | not started |
| BP-P04-PST-009 | 34 | Post-Order | Request Refund | Refund with reason | not stated | not started |
| BP-P04-PST-010 | 34 | Post-Order | Contact Merchant | Message/WhatsApp to merchant support | not stated | not started |
| BP-P04-PST-011 | 34 | Post-Order | One-Click Reorder | Re-add past order to cart | not stated | not started |

### P04-NTF — Notifications (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P04-NTF-001 | 34 | Notifications | Order Status Updates | Push/email/SMS per event | not stated | not started |
| BP-P04-NTF-002 | 35 | Notifications | Shipment Dispatched / Delivered | Logistics event notifications | not stated | not started |
| BP-P04-NTF-003 | 35 | Notifications | Wishlist Price Drop | Alert when saved item price drops | not stated | not started |
| BP-P04-NTF-004 | 35 | Notifications | Wishlist Restock | Alert when out-of-stock item restocks | not stated | not started |
| BP-P04-NTF-005 | 35 | Notifications | Wishlist Low Stock | Alert when wishlist item runs low | not stated | not started |
| BP-P04-NTF-006 | 35 | Notifications | Abandoned Cart Reminder | Re-engagement with optional discount | not stated | not started |

## P05 — Merchant Mobile App (App Maker)

Declared: 36 features. PDF pages 35–38. Sum of declared group counts = 32, not 36.

### P05-DSN — Design — Merchant (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P05-DSN-001 | 35 | Design — Merchant | Homepage Screen Builder | Configure hero, categories, featured products, banners | Plus+ | not started |
| BP-P05-DSN-002 | 35 | Design — Merchant | Brand Customization | Colors, fonts, logo, splash screen, app icon | Plus+ | not started |
| BP-P05-DSN-003 | 35 | Design — Merchant | Product Grid / List Toggle | Choose display style for product listings | Plus+ | not started |

> Count mismatch: header declares 6, 3 rows present in source (3 missing). Missing rows are not invented here.
> Note: Group description names a drag-and-drop screen editor, a live phone preview and post-launch design pushes; no rows are present for them.

### P05-PUB — Publishing — Merchant (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P05-PUB-001 | 36 | Publishing — Merchant | Fill App Store Details | App name, description, keywords, screenshots, category | Plus+ | not started |
| BP-P05-PUB-002 | 36 | Publishing — Merchant | Submit for Lak Review | 2–7 day review window | Plus+ | not started |
| BP-P05-PUB-003 | 36 | Publishing — Merchant | Apple App Store Publishing | iOS app built, signed, and published | Plus+ | not started |
| BP-P05-PUB-004 | 36 | Publishing — Merchant | Google Play Publishing | Android app built, signed, and published | Plus+ | not started |

> Count mismatch: header declares 5, 4 rows present in source (1 missing). Missing rows are not invented here.

### P05-SYN — Sync — Merchant (declared 4)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P05-SYN-001 | 36 | Sync — Merchant | Product Sync (Real-Time) | App auto-syncs products from store | Plus+ | not started |
| BP-P05-SYN-002 | 36 | Sync — Merchant | Order Sync | All app orders visible in store dashboard | Plus+ | not started |
| BP-P05-SYN-003 | 36 | Sync — Merchant | Inventory Sync | Stock levels synchronized across web and app | Plus+ | not started |
| BP-P05-SYN-004 | 36 | Sync — Merchant | Price & Promo Sync | Discounts and offers auto-appear in app | Plus+ | not started |

### P05-APP — App Features — Customer (declared 7)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P05-APP-001 | 36 | App Features — Customer | Full Product Catalog | Browse all products with search and filters | Plus+ | not started |
| BP-P05-APP-002 | 37 | App Features — Customer | Cart & Full Checkout Flow | Complete checkout identical to web store | Plus+ | not started |
| BP-P05-APP-003 | 37 | App Features — Customer | Push Notifications | Order updates, promotions, restock alerts | Plus+ | not started |
| BP-P05-APP-004 | 37 | App Features — Customer | Order Tracking (In-App) | Track shipment within app | Plus+ | not started |
| BP-P05-APP-005 | 37 | App Features — Customer | Account, Profile & Wishlist | Login, order history, wishlist management | Plus+ | not started |
| BP-P05-APP-006 | 37 | App Features — Customer | Loyalty Points (In-App) | Earn and redeem points in app | Plus+ | not started |
| BP-P05-APP-007 | 37 | App Features — Customer | Reviews (In-App) | Submit reviews from within app | Plus+ | not started |

### P05-BLD — Build Infrastructure (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P05-BLD-001 | 37 | Build Infrastructure | Cloud CI/CD Build Server | Android AAB and iOS IPA automated builds | Admin | not started |
| BP-P05-BLD-002 | 37 | Build Infrastructure | Automated Signing | Code signing for both platforms | Admin | not started |
| BP-P05-BLD-003 | 37 | Build Infrastructure | Store Upload API | Google Play and App Store Connect API for automated upload | Admin | not started |

> Count mismatch: header declares 5, 3 rows present in source (2 missing). Missing rows are not invented here.
> Note: Group description names build-status notifications and OTA config updates; no rows are present for them.

### P05-INA — In-App Shopping (Customer View) (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P05-INA-001 | 37 | In-App Shopping (Customer View) | Full Store in Native App | All shopping features in branded iOS/Android app | not stated | not started |
| BP-P05-INA-002 | 37 | In-App Shopping (Customer View) | Push Notifications | Order updates, promotions, stock alerts | not stated | not started |
| BP-P05-INA-003 | 37 | In-App Shopping (Customer View) | In-App Order Tracking | Track shipment within app | not stated | not started |
| BP-P05-INA-004 | 38 | In-App Shopping (Customer View) | In-App Wishlist | Add/remove from wishlist | not stated | not started |
| BP-P05-INA-005 | 38 | In-App Shopping (Customer View) | In-App Loyalty Points | View and redeem points | not stated | not started |

> Note: No group description and no ACCESS column in source. Rows overlap App Features — Customer.

## P06 — Global Lak App & Marketplace

Declared: 49 features. PDF pages 38–40. Source column is AUDIENCE, not ACCESS. Sum of declared group counts = 21, not 49. Project intro names POS, Enterprise, App/Theme stores and Academy; no groups or rows exist for them.

### P06-MKP — Lak Marketplace (declared 9)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P06-MKP-001 | 38 | Lak Marketplace | Auto-Listing (Built-In) | All Lak store products listed automatically — zero merchant effort | not stated (audience: Merchant) | not started |
| BP-P06-MKP-002 | 38 | Lak Marketplace | Zero Commission Marketplace | No sales commission charged to merchants | not stated (audience: Merchant) | not started |
| BP-P06-MKP-003 | 38 | Lak Marketplace | Products Listed | Full product depth across stores | not stated (audience: Consumer) | not started |
| BP-P06-MKP-004 | 38 | Lak Marketplace | Consumer iOS App | Lak Marketplace app on Apple App Store | not stated (audience: Consumer) | not started |
| BP-P06-MKP-005 | 38 | Lak Marketplace | Consumer Android App | Lak Marketplace app on Google Play | not stated (audience: Consumer) | not started |
| BP-P06-MKP-006 | 38 | Lak Marketplace | Location-Based Discovery | Show nearby merchants / local products | not stated (audience: Consumer) | not started |
| BP-P06-MKP-007 | 38 | Lak Marketplace | Category & Brand Browse | Structured discovery within Lak Marketplace | not stated (audience: Consumer) | not started |
| BP-P06-MKP-008 | 39 | Lak Marketplace | Merchant Profile Page | Store profile visible in Lak Marketplace directory | not stated (audience: Merchant) | not started |

> Count mismatch: header declares 9, 8 rows present in source (1 missing). Missing rows are not invented here.

### P06-WHS — Lak Wholesale (declared 5)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P06-WHS-001 | 39 | Lak Wholesale | Wholesaler Account | Supplier lists products at wholesale prices | not stated (audience: Merchant) | not started |
| BP-P06-WHS-002 | 39 | Lak Wholesale | Retailer Account | Retailers browse and buy in bulk | not stated (audience: Merchant) | not started |
| BP-P06-WHS-003 | 39 | Lak Wholesale | Instant Product Sync from Lak | Auto-sync store catalog to Lak Wholesale listing | not stated (audience: Merchant) | not started |
| BP-P06-WHS-004 | 39 | Lak Wholesale | Inventory Sync | Real-time stock across both channels | not stated (audience: Merchant) | not started |
| BP-P06-WHS-005 | 39 | Lak Wholesale | Wholesale Order Dashboard | Bulk orders in main Lak dashboard | not stated (audience: Merchant) | not started |

> Note: Plan matrix (page 43) gates Lak Wholesale to Plus+.

### P06-ADS — Lak Ads (declared 6)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P06-ADS-001 | 39 | Lak Ads | Google / YouTube Campaigns | Managed PPC from Lak dashboard | not stated (audience: Merchant) | not started |
| BP-P06-ADS-002 | 39 | Lak Ads | TikTok Campaigns | TikTok for Business integration | not stated (audience: Merchant) | not started |
| BP-P06-ADS-003 | 39 | Lak Ads | Snapchat Campaigns | Snapchat Business integration | not stated (audience: Merchant) | not started |
| BP-P06-ADS-004 | 39 | Lak Ads | Meta / Instagram Campaigns | Meta Business suite integration | not stated (audience: Merchant) | not started |
| BP-P06-ADS-005 | 39 | Lak Ads | X (Twitter) Campaigns | X Ads integration | not stated (audience: Merchant) | not started |
| BP-P06-ADS-006 | 39–40 | Lak Ads | Campaign Analytics in Dashboard | All ad performance in one view | not stated (audience: Merchant) | not started |

> Note: Plan matrix (page 43) gates Lak Ads to Plus+. Overlaps P03 Marketing — Ads.

### P06-COM — Lak Community (declared 1)

| ID | PDF page | Group | Feature | What it does | Plan access | Status |
|---|---|---|---|---|---|---|
| BP-P06-COM-001 | 40 | Lak Community | Community Hub | Forums, events, news, groups at community.lak.sa | not stated (audience: Merchant) | not started |

## Shared Services — Integrations (PDF pages 40–42)

Declared: 67 integrations across payment, shipping, government/tax, ERP, marketing, analytics, communication and automation. Listed in source: 50. No ERP, accounting or automation integrations are listed although the section intro and plan matrix name them. Format in source: `Name — description · region/scope`.

| ID | PDF page | Category | Integration | Description | Region / scope | Status |
|---|---|---|---|---|---|---|
| BP-INT-PAY-001 | 40 | Payment — Local KSA | Mada | Saudi debit card gateway | KSA | not started |
| BP-INT-PAY-002 | 40 | Payment — Local KSA | STC Pay | Mobile wallet | KSA | not started |
| BP-INT-PAY-003 | 40 | Payment — Local KSA | Madfu | BNPL | KSA | not started |
| BP-INT-PAY-004 | 40 | Payment — Local KSA | Emkan | Installments | KSA | not started |
| BP-INT-PAY-005 | 40 | Payment — Local KSA | Mokafa | Loyalty redemption payment | KSA | not started |
| BP-INT-PAY-006 | 40 | Payment — Local GCC | Tabby | BNPL — Buy Now Pay Later | KSA/UAE | not started |
| BP-INT-PAY-007 | 40 | Payment — Local GCC | Tamara | BNPL | KSA/UAE | not started |
| BP-INT-PAY-008 | 40 | Payment — Local GCC | MIS Pay | GCC mobile payment | GCC | not started |
| BP-INT-PAY-009 | 40 | Payment — International | Visa / Mastercard / Amex | Card processing | Global | not started |
| BP-INT-PAY-010 | 40 | Payment — International | Apple Pay | Mobile wallet | Global | not started |
| BP-INT-PAY-011 | 40 | Payment — International | PayPal | Digital wallet | Global | not started |
| BP-INT-PAY-012 | 40–41 | Payment — International | Stripe | Card processing (via partner) | Global | not started |
| BP-INT-PAY-013 | 40 | Payment — Manual | Bank Transfer | Manual bank details display | All | not started |
| BP-INT-PAY-014 | 40 | Payment — Manual | Cash on Delivery | COD with configurable limits | All | not started |
| BP-INT-SHP-001 | 41 | Shipping — KSA | Fastlo | Saudi carrier, auto-status update | KSA | not started |
| BP-INT-SHP-002 | 41 | Shipping — KSA | Salasa | Saudi carrier, auto-status update | KSA | not started |
| BP-INT-SHP-003 | 41 | Shipping — KSA | Nakel | Saudi carrier | KSA | not started |
| BP-INT-SHP-004 | 41 | Shipping — KSA | SMSA | Saudi postal carrier | KSA | not started |
| BP-INT-SHP-005 | 41 | Shipping — KSA | Aymakan | Saudi carrier | KSA | not started |
| BP-INT-SHP-006 | 41 | Shipping — KSA | Prolo | Saudi carrier | KSA | not started |
| BP-INT-SHP-007 | 41 | Shipping — KSA | Esnad | Saudi carrier | KSA | not started |
| BP-INT-SHP-008 | 41 | Shipping — KSA | Marsul | Saudi carrier | KSA | not started |
| BP-INT-SHP-009 | 41 | Shipping — KSA | Track | Saudi carrier | KSA | not started |
| BP-INT-SHP-010 | 41 | Shipping — KSA | Redbox | Saudi carrier | KSA | not started |
| BP-INT-SHP-011 | 41 | Shipping — GCC | Aramex | Regional + global carrier | GCC+ | not started |
| BP-INT-SHP-012 | 41 | Shipping — GCC | Shipa | GCC carrier | GCC | not started |
| BP-INT-SHP-013 | 41 | Shipping — GCC | Emirates Post | UAE postal service | UAE | not started |
| BP-INT-SHP-014 | 41 | Shipping — Global | DHL | Global express | Global | not started |
| BP-INT-SHP-015 | 41 | Shipping — Global | iMile | GCC + global | GCC+ | not started |
| BP-INT-SHP-016 | 41 | Shipping — Global | Diggipacks | Packaging + delivery | GCC | not started |
| BP-INT-GOV-001 | 41 | Government / Tax | ZATCA Fatoora (KSA) | E-invoicing clearance + reporting | KSA | not started |
| BP-INT-GOV-002 | 41 | Government / Tax | UAE Federal Tax Authority | UAE VAT e-invoicing | UAE | not started |
| BP-INT-GOV-003 | 41 | Government / Tax | Egyptian Tax Authority | Egypt VAT | EGY | not started |
| BP-INT-GOV-004 | 41 | Government / Tax | Bahrain NBR | Bahrain VAT | BHR | not started |
| BP-INT-GOV-005 | 41 | Government / Tax | Oman Tax Authority | Oman VAT | OMN | not started |
| BP-INT-EML-001 | 41 | Marketing — Email | Klaviyo | Email & SMS automation | All | not started |
| BP-INT-EML-002 | 41 | Marketing — Email | Mailchimp | Email marketing | All | not started |
| BP-INT-SOC-001 | 41 | Marketing — Social | Facebook / Meta Ads | Ad campaigns + pixel | All | not started |
| BP-INT-SOC-002 | 41 | Marketing — Social | TikTok Shop & Ads | Catalog sync + campaigns | All | not started |
| BP-INT-SOC-003 | 41 | Marketing — Social | Snapchat Ads | Campaign management | All | not started |
| BP-INT-SOC-004 | 42 | Marketing — Social | Google Ads / Shopping | Search + shopping campaigns | All | not started |
| BP-INT-SOC-005 | 42 | Marketing — Social | Twitter / X Ads | Ad campaigns | All | not started |
| BP-INT-ANA-001 | 42 | Analytics | Google Analytics 4 | Site analytics | All | not started |
| BP-INT-ANA-002 | 42 | Analytics | Google Tag Manager | Tag container | All | not started |
| BP-INT-ANA-003 | 42 | Analytics | Hotjar | Heatmaps + session recording | All | not started |
| BP-INT-ANA-004 | 42 | Analytics | Facebook Pixel | Conversion tracking | All | not started |
| BP-INT-COM-001 | 42 | Communication | SMS Gateway | Generic SMS OTP + notifications | All | not started |
| BP-INT-COM-002 | 42 | Communication | WhatsApp Business API | Order confirmations, updates via WhatsApp | All | not started |
| BP-INT-MKP-001 | 42 | Marketplace — B2C | Lak Marketplace | Free consumer marketplace (built-in) | All | not started |
| BP-INT-MKP-002 | 42 | Marketplace — B2B | Lak Wholesale | Wholesale B2B marketplace (built-in) | Plus+ | not started |

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

| ID | PDF page | Feature | Basic (Free) | Plus | Pro | Special (Enterprise) | Status |
|---|---|---|---|---|---|---|---|
| BP-PLN-001 | 42 | Unlimited Products | ✓ | ✓ | ✓ | ✓ | not started |
| BP-PLN-002 | 42 | Unlimited Customers | ✓ | ✓ | ✓ | ✓ | not started |
| BP-PLN-003 | 42 | Unlimited Orders | ✓ | ✓ | ✓ | ✓ | not started |
| BP-PLN-004 | 42 | Sales Commission | 0% | 0% | 0% | Custom | not started |
| BP-PLN-005 | 43 | Coupons & Discount Codes | ✓ | ✓ | ✓ | ✓ | not started |
| BP-PLN-006 | 43 | Customer Reviews & Q&A | ✓ | ✓ | ✓ | ✓ | not started |
| BP-PLN-007 | 43 | Cash on Delivery | ✓ | ✓ | ✓ | ✓ | not started |
| BP-PLN-008 | 43 | Bank Transfer Payments | ✓ | ✓ | ✓ | ✓ | not started |
| BP-PLN-009 | 43 | Online Payments (Mada, Cards, Apple Pay, etc.) | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-010 | 43 | Global Shipping Fleet (Discounted) | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-011 | 43 | Lak Shipping Labels + Quality Center | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-012 | 43 | Customer Wallet | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-013 | 43 | Gift Cards | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-014 | 43 | Loyalty Points Program | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-015 | 43 | Cashback Program | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-016 | 43 | Lak Ads (All Channels) | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-017 | 43 | Marketing Email / SMS Campaigns | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-018 | 43 | Lak Wholesale B2B Marketplace | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-019 | 43 | Accounting Integrations | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-020 | 43 | CSS / JS Custom Code | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-021 | 43 | Lak Theme Builder | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-022 | 43 | Landing Pages | ✗ | ✓ | ✓ | ✓ | not started |
| BP-PLN-023 | 43 | Connect / Register Domain | Connect | Connect/Register | Free Domain | Free Domain | not started |
| BP-PLN-024 | 44 | Basic Reports | ✓ | ✓ | ✓ | ✓ | not started |
| BP-PLN-025 | 44 | Advanced Reports & Analytics | ✗ | Limited | Full | Full | not started |
| BP-PLN-026 | 44 | Staff Accounts | 1 | 3 | Unlimited | Unlimited | not started |
| BP-PLN-027 | 44 | Staff Roles & RBAC | ✗ | ✗ | ✓ | ✓ | not started |
| BP-PLN-028 | 44 | Multiple Stores | 1 | 1 | Unlimited | Unlimited | not started |
| BP-PLN-029 | 44 | Customer Segmentation | ✗ | ✗ | ✓ | ✓ | not started |
| BP-PLN-030 | 44 | Affiliate Program | ✗ | ✗ | ✓ | ✓ | not started |
| BP-PLN-031 | 44 | Influencer Campaigns | ✗ | ✗ | ✓ | ✓ | not started |
| BP-PLN-032 | 44 | 3D Product View | ✗ | ✗ | ✓ | ✓ | not started |
| BP-PLN-033 | 44 | Bulk / Quantity Pricing | ✗ | ✗ | ✓ | ✓ | not started |
| BP-PLN-034 | 44 | Restrict Shipping Visibility | ✗ | ✗ | ✓ | ✓ | not started |
| BP-PLN-035 | 44 | Auto-Assign Warehouse by City | ✗ | ✗ | ✓ | ✓ | not started |
| BP-PLN-036 | 44 | Order Scheduling / Booking | ✗ | ✗ | ✓ | ✓ | not started |
| BP-PLN-037 | 44 | Bank Offers at Checkout | ✗ | ✗ | ✓ | ✓ | not started |
| BP-PLN-038 | 44 | App Maker (Mobile App) | ✗ | Add-on | Add-on | Add-on | not started |
| BP-PLN-039 | 44 | Lak Marketplace Auto-Listing | ✓ | ✓ | ✓ | ✓ | not started |
| BP-PLN-040 | 44 | VAT / ZATCA | ✓ | ✓ | ✓ | ✓ | not started |
| BP-PLN-041 | 44 | ERP Integration | ✗ | ✗ | Limited | Full | not started |
| BP-PLN-042 | 44 | Multi-Branch (Advanced) | ✗ | ✗ | Basic | Advanced | not started |
| BP-PLN-043 | 44 | Flexible Payment Fees | ✗ | ✗ | ✗ | ✓ | not started |
| BP-PLN-044 | 44 | Dedicated Account Manager | ✗ | ✗ | ✗ | ✓ | not started |
| BP-PLN-045 | 45 | Custom Integrations | ✗ | ✗ | ✗ | ✓ | not started |
| BP-PLN-046 | 45 | SLA-Backed Priority Support | ✗ | ✗ | ✗ | ✓ | not started |

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

| ID | PDF page | Step | Description | Status |
|---|---|---|---|---|
| BP-JRN-MER-01 | 45 | 1 | Register Account (Individual / Corporate / Charity / Sole Proprietorship) | not started |
| BP-JRN-MER-02 | 45 | 2 | Choose & Pay for Subscription Plan (Basic / Plus / Pro / Special) | not started |
| BP-JRN-MER-03 | 45 | 3 | Complete KYC & Store Verification (docs upload, approval) | not started |
| BP-JRN-MER-04 | 45 | 4 | Configure Store: Theme, Logo, Colors, Domain | not started |
| BP-JRN-MER-05 | 45 | 5 | Setup Payment Methods (To be determined) | not started |
| BP-JRN-MER-06 | 45 | 6 | Setup Shipping Zones & Connect Carriers | not started |
| BP-JRN-MER-07 | 45 | 7 | Add Categories, Brands, Products, Variants, Bundles | not started |
| BP-JRN-MER-08 | 45 | 8 | Configure Inventory & Warehouses / Branches | not started |
| BP-JRN-MER-09 | 45 | 9 | Configure Tax Rules | not started |
| BP-JRN-MER-10 | 45 | 10 | Set Pricing, Discounts, Coupons, Loyalty, Cashback | not started |
| BP-JRN-MER-11 | 45 | 11 | Publish Store & Activate Accept Orders | not started |
| BP-JRN-MER-12 | 45 | 12 | Receive Orders → Review → Confirm → Create Shipment → Ship → Deliver | not started |
| BP-JRN-MER-13 | 45 | 13 | Process Returns, Refunds, Exchanges | not started |
| BP-JRN-MER-14 | 46 | 14 | Run Marketing Campaigns, Ads, Influencer Programs | not started |
| BP-JRN-MER-15 | 46 | 15 | Analyze Reports → Optimize → Grow | not started |
| BP-JRN-MER-16 | 46 | 16 | Optionally: Build Mobile App via App Maker | not started |
| BP-JRN-MER-17 | 46 | 17 | Optionally: Manage in-person sales via POS (separate platform) | not started |

### Customer journey

| ID | PDF page | Step | Description | Status |
|---|---|---|---|---|
| BP-JRN-CUS-01 | 45 | 1 | Discover Store (Direct URL / Social Ad / SEO result) | not started |
| BP-JRN-CUS-02 | 45 | 2 | Browse Categories, Brands, Search Products | not started |
| BP-JRN-CUS-03 | 45 | 3 | View Product Detail (images, reviews, Q&A, variants, stock, shipping estimate) | not started |
| BP-JRN-CUS-04 | 45 | 4 | Add to Cart / Wishlist | not started |
| BP-JRN-CUS-05 | 45 | 5 | Login / Register (optional — guest checkout available) | not started |
| BP-JRN-CUS-06 | 45 | 6 | Apply Coupon Code at cart | not started |
| BP-JRN-CUS-07 | 45 | 7 | Proceed to Checkout: Address → Shipping Method → Payment Method | not started |
| BP-JRN-CUS-08 | 45 | 8 | Review Order Summary (items, VAT, discount, total) | not started |
| BP-JRN-CUS-09 | 45 | 9 | Complete Payment (online / COD / Wallet / Gift Card) | not started |
| BP-JRN-CUS-10 | 45 | 10 | Receive Order Confirmation (email + SMS) and PDF Invoice | not started |
| BP-JRN-CUS-11 | 45 | 11 | Track Shipment via platform or carrier link | not started |
| BP-JRN-CUS-12 | 45 | 12 | Receive Delivery Notification | not started |
| BP-JRN-CUS-13 | 45 | 13 | Confirm Receipt | not started |
| BP-JRN-CUS-14 | 46 | 14 | Rate Product, Rate Store, Rate Shipping Carrier | not started |
| BP-JRN-CUS-15 | 46 | 15 | Optionally: Request Return / Refund / Exchange | not started |
| BP-JRN-CUS-16 | 46 | 16 | Earn Loyalty Points, Redeem Cashback | not started |

### Platform admin journey

| ID | PDF page | Step | Description | Status |
|---|---|---|---|---|
| BP-JRN-ADM-01 | 46 | 1 | Login to Super Admin Portal (2FA protected) | not started |
| BP-JRN-ADM-02 | 46 | 2 | Review & Approve / Reject Merchant Registrations (KYC review) | not started |
| BP-JRN-ADM-03 | 46 | 3 | Manage Merchant Plans, Billing & Renewals | not started |
| BP-JRN-ADM-04 | 46 | 4 | Monitor All Stores — Suspend / Reactivate as needed | not started |
| BP-JRN-ADM-05 | 46 | 5 | Manage Payment Gateways & Monitor Transactions | not started |
| BP-JRN-ADM-06 | 46 | 6 | Configure Shipping Providers Platform-Wide | not started |
| BP-JRN-ADM-07 | 46 | 7 | Manage Themes | not started |
| BP-JRN-ADM-08 | 46 | 8 | Manage App Marketplace (approve/reject partner apps) | not started |
| BP-JRN-ADM-09 | 46 | 9 | Monitor Platform KPIs (Revenue, GMV, Active Stores, MRR) | not started |
| BP-JRN-ADM-10 | 46 | 10 | Manage Help Center, Blog, Static Pages | not started |
| BP-JRN-ADM-11 | 46 | 11 | Generate Reports & Export Data | not started |
| BP-JRN-ADM-12 | 46 | 12 | Monitor System Health, API Usage, Security Logs, Audit Trails | not started |

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

## Cross-cutting observations

| # | Area | Observation |
|---|---|---|
| 1 | Totals | Declared 27+47+244+64+36+49 = 467; registered rows = see Summary. P06 declares 49 but its four groups declare 21 |
| 2 | Duplicates | Assign Order to Staff (P03-ORD) and Assign Orders to Staff (P03-STF); Abandoned Cart Reminders (P03-ORD) and Abandoned Cart Email / SMS (P03-EMS); Customer Back-in-Stock Subscribe (P03-INV) and Back-in-Stock Alert (P03-EMS); Pickup Location Setup (P03-STP) and Pickup Locations (P03-SHP); P03 Marketing — Ads and P06 Lak Ads; P05 App Features — Customer and P05 In-App Shopping |
| 3 | BNPL | P04 Payment row names "Tabby or Tamara" only; P03 Payment Setup also has Madfu, Emkan, MIS Pay |
| 4 | Cross-store data | Flag Non-Serious Customer (Lak-wide warning) and Unified Account (Cross-Store) share customer data between merchants; Privacy Policy row claims GDPR/PDPL compliance |
| 5 | Connect Carriers | Row text "based on Time & Material" is unclear in source |
| 6 | Free Subdomain | Row text is the placeholder "platform.com/slug" |
| 7 | App review | "Submit for Lak Review — 2–7 day review window" has no matching P02 Super Admin row |
| 8 | Ecosystem | P06 intro names Wholesale, Ads, POS, Enterprise, App/Theme stores, Academy, Community; only Marketplace, Wholesale, Ads and Community have rows |
| 9 | PDF page 47 | Footer only; no content |
