// Welcome pop-up in the online store (free app «popup», only when installed and on and the store takes orders).
// Arms on the merchant's pages, opens on its trigger, at most once per visit and once per cap period. A sign-up needs
// an explicit consent tick; it adds the visitor to customers with that consent and gives a single-use welcome code.
import { useEffect, useState } from 'react';
import { Check, Copy, Gift, X } from 'lucide-react';
import type { Route } from '../../../../core/router';
import { Button, cn, useTx } from '../../../../ds/ui';
import { couponsStore, customersStore, settingsStore } from '../../../merchant/stores';
import { shopperView } from '../../storefront/model';
import { riyadhDate } from '../../../storefront/bridge';
import { cartStore } from '../../../storefront/state';
import { to, useS } from '../../../storefront/kit';
import { freeAppsStore, isOn } from './registry';
import { POPUP_DEFAULTS, effectiveTrigger, mayShow, pageKind, signUp, signupProblems, type PopupSettings } from './popup-model';
import { countShown, recordSignup, settingsOf, shopperAppsStore, storeAppsLog } from './store-runtime';

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px) and (pointer: fine)').matches;
let shownThisVisit = false;

export function StoreWelcomePopup({ route }: { route: Route }) {
  const apps = freeAppsStore.use();
  const status = settingsStore.use().status;
  const sh = shopperAppsStore.use();
  const [open, setOpen] = useState(false);
  const on = isOn(apps, 'popup') && shopperView(status) === 'open';
  const s = settingsOf(apps, 'popup', POPUP_DEFAULTS);
  const page = pageKind(route.path[0]);
  const armed = on && mayShow(s, { page, lastShownAt: sh.popupShownAt, signedUp: !!sh.popupSignedUp, shownThisVisit }, Date.now());
  const trig = effectiveTrigger(s, !!isDesktop());

  useEffect(() => {
    if (!armed || open) return;
    const fire = () => { if (shownThisVisit) return; shownThisVisit = true; setOpen(true); countShown('popup', `popup:${Date.now()}`); shopperAppsStore.set((x) => ({ ...x, popupShownAt: Date.now() })); };
    if (trig.trigger === 'delay') { const t = window.setTimeout(fire, s.delaySec * 1000); return () => window.clearTimeout(t); }
    if (trig.trigger === 'scroll') {
      const onScroll = () => { const h = document.documentElement; const max = h.scrollHeight - h.clientHeight; if (max <= 0 || (h.scrollTop / max) * 100 >= trig.scrollPct) fire(); };
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }
    const onOut = (e: MouseEvent) => { if (!e.relatedTarget && e.clientY <= 0) fire(); };
    document.addEventListener('mouseout', onOut);
    return () => document.removeEventListener('mouseout', onOut);
  }, [armed, open, trig.trigger, trig.scrollPct, s.delaySec]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    (document.querySelector('[data-free-app="popup"] input') as HTMLInputElement | null)?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <PopupCard s={s} onClose={() => setOpen(false)} />
    </div>
  );
}

/** The pop-up card; also the dashboard preview (nothing is saved from the preview). */
export function PopupCard({ s, onClose, preview }: { s: PopupSettings; onClose?: () => void; preview?: boolean }) {
  const tx = useTx();
  const { lang, m, d } = useS();
  const store = settingsStore.use().store.name;
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [code, setCode] = useState<{ code: string; ends: string; repeat: boolean } | null>(null);
  const [applied, setApplied] = useState(false);
  const probs = signupProblems(s.channel, contact, consent);
  const submit = () => {
    setTried(true);
    if (preview || probs.length) return;
    const now = Date.now();
    const r = signUp({ customers: customersStore.get(), coupons: couponsStore.get(), signups: storeAppsLog.get().signups }, s, contact, now, riyadhDate(now));
    if (!r.repeat) { customersStore.set(r.customers); couponsStore.set(r.coupons); recordSignup(r.signup); }
    const c = r.coupons.find((x) => x.code === r.signup.code);
    shopperAppsStore.set((x) => ({ ...x, popupSignedUp: r.signup.code }));
    setCode({ code: r.signup.code, ends: c?.ends ?? '', repeat: r.repeat });
  };
  const apply = () => { if (!code) return; cartStore.set((c) => ({ ...c, coupon: code.code })); setApplied(true); };
  const consentText = s.channel === 'email'
    ? tx(`أوافق على استلام العروض من ${store} على بريدي، ويمكنني إلغاء الاشتراك متى شئت.`, `I agree to receive offers from ${store} by email and can unsubscribe at any time.`)
    : tx(`أوافق على استلام العروض من ${store} برسائل الجوال، ويمكنني إيقافها متى شئت.`, `I agree to receive offers from ${store} by text message and can stop them at any time.`);
  return (
    <div role="dialog" aria-modal={!preview} aria-label={s.headline[lang]} data-free-app="popup"
      className={cn('w-full overflow-hidden border border-border bg-surface shadow-pop', preview ? 'rounded-2xl' : 'max-h-[92vh] overflow-y-auto rounded-t-3xl sm:max-w-md sm:rounded-2xl')}>
      <div className="flex items-start gap-3 bg-brand-600/10 px-5 pb-4 pt-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white"><Gift className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-brand-700 dark:text-brand-300">{tx(`خصم ${s.pct}٪`, `${s.pct}% off`)}</p>
          <h2 className="text-lg font-bold leading-snug text-fg" dir="auto">{s.headline[lang]}</h2>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label={tx('إغلاق', 'Close')} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2"><X className="size-5" aria-hidden="true" /></button>}
      </div>
      {code ? (
        <div className="space-y-3 p-5 text-sm">
          <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400"><Check className="size-4" aria-hidden="true" />{code.repeat ? tx('اشتركت من قبل، هذا كودك:', 'You already signed up. Your code:') : tx('شكرًا! كودك الترحيبي:', 'Thanks! Your welcome code:')}</p>
          <p className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-brand-400 bg-surface-2 px-4 py-3"><bdi dir="ltr" className="text-lg font-bold tracking-widest">{code.code}</bdi>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300" onClick={() => { try { void navigator.clipboard?.writeText(code.code); } catch { /* copy is optional */ } }}><Copy className="size-3.5" aria-hidden="true" />{tx('انسخ', 'Copy')}</button></p>
          <p className="text-xs text-muted">{tx('لمرة واحدة', 'Single use')}{code.ends ? ` · ${tx('صالح حتى', 'valid until')} ${d(Date.parse(`${code.ends}T12:00:00Z`))}` : ''}{s.minSpend ? ` · ${tx('لطلب من', 'on orders from')} ${m(s.minSpend)}` : ''}</p>
          <div className="flex flex-wrap gap-2">
            {applied ? <a href={to('/cart')} className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white">{tx('أُضيف للحقيبة، اذهب إليها', 'Added to your bag, go to it')}</a> : <Button onClick={apply}>{tx('طبّقه على حقيبتي', 'Apply to my bag')}</Button>}
            {onClose && <Button variant="secondary" onClick={onClose}>{tx('تابع التسوق', 'Keep shopping')}</Button>}
          </div>
        </div>
      ) : (
        <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <label className="block space-y-1.5 text-[13px] font-semibold">
            <span>{s.channel === 'email' ? tx('بريدك الإلكتروني', 'Your email') : tx('رقم جوالك', 'Your mobile number')}</span>
            <input type={s.channel === 'email' ? 'email' : 'tel'} dir="ltr" inputMode={s.channel === 'email' ? 'email' : 'tel'} value={contact} onChange={(e) => setContact(e.target.value)}
              placeholder={s.channel === 'email' ? 'name@example.com' : '05X XXX XXXX'} aria-invalid={tried && probs.includes('contact') ? true : undefined}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-normal" />
            {tried && probs.includes('contact') && <span className="block text-xs font-medium text-red-600 dark:text-red-400">{s.channel === 'email' ? tx('اكتب بريدًا صحيحًا', 'Enter a valid email') : tx('اكتب جوالًا سعوديًا يبدأ بـ 05', 'Enter a Saudi mobile starting 05')}</span>}
          </label>
          <label className="flex items-start gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]" />
            <span>{consentText} <a href={to('/page/privacy')} className="font-semibold text-fg underline underline-offset-2">{tx('الخصوصية', 'Privacy')}</a></span>
          </label>
          {tried && probs.includes('consent') && <p className="text-xs font-medium text-red-600 dark:text-red-400">{tx('الموافقة مطلوبة للحصول على الخصم', 'Consent is needed for the discount')}</p>}
          <Button type="submit" className="h-11 w-full" disabled={preview}>{tx('احصل على الخصم', 'Get my discount')}</Button>
          {onClose && <button type="button" onClick={onClose} className="w-full text-center text-xs font-medium text-muted hover:text-fg">{tx('لا، شكرًا', 'No, thanks')}</button>}
        </form>
      )}
    </div>
  );
}
