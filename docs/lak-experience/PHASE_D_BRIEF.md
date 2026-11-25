# Brief: Phase D — services that wait on a business decision

The owner asked to start Phase D: the 12 Salla services in `docs/salla-audit/MATRIX.md` marked «تحتاج قرارًا تجاريًا», plus related blueprint rows. Build them as complete, working tools, but **no commercial value is invented**.

## Rules on top of `docs/lak-experience/BUILD_GROUP_BRIEF.md`
- Every LAK price, fee, commission, plan price, rate, payout term or limit that LAK would set is shown as «بانتظار الاعتماد» / "Pending approval". Where a calculation needs a number, the field is editable, starts empty or with an obviously labelled example («مثال للتجربة»), and the screen says the real value comes from LAK after approval.
- Values the **merchant** sets (their own commission to affiliates, their own wholesale prices, their own cashback %) are normal inputs with validation — those are not LAK's decisions.
- No fake people, companies, influencers, vendors, theme authors or partners. Lists of partners/vendors show an honest empty state («الشركاء بانتظار الاعتماد») or merchant-added entries only.
- Each new tool carries a small «قرار مطلوب» marker linking to a single page `#/dashboard/settings/decisions` (built by the platform-commercials agent) that lists every pending decision with what it blocks.
- Salla audit evidence: `docs/salla-audit/notes/05-marketing.md`, `07-finance.md`, `08-store-and-channels.md`, `09-apps-and-integrations.md`, `11-support-shipping-logs.md`, `12-settings.md`. Be clearly better, never copy layout or wording; state the edge in your report.
- Full journeys (input → preview → execute/simulate → result → recovery), `logAction`, `useUnsaved` + session drafts, tools registered in `model/tools.ts`, AR/EN, 1440 + 390 + dark, no horizontal scroll, no console errors. Update the matching rows in `docs/salla-audit/MATRIX.md` (status becomes «واجهة محاكاة — القيم بانتظار الاعتماد» where built).
