import type { ComponentType } from 'react';
import { useLang, type L } from './core/lang';
import { link, sub, useRoute, type Route } from './core/router';
import { resetAll } from './core/store';
import Site from './surfaces/site';
import Admin from './surfaces/admin';
import Merchant from './surfaces/merchant';
import Storefront from './surfaces/storefront';
import AppMaker from './surfaces/appmaker';
import Market from './surfaces/market';

/** The six surfaces of the platform blueprint, in dependency order. */
const SURFACES: { id: string; name: L; who: L; C: ComponentType<{ route: Route }> }[] = [
  { id: 'site', name: { ar: 'موقع لك', en: 'LAK website' }, who: { ar: 'زائر يفكر في فتح متجر', en: 'A visitor considering a store' }, C: Site },
  { id: 'admin', name: { ar: 'إدارة المنصة', en: 'Platform admin' }, who: { ar: 'فريق تشغيل لك', en: 'LAK operations team' }, C: Admin },
  { id: 'merchant', name: { ar: 'لوحة التاجر', en: 'Merchant workspace' }, who: { ar: 'التاجر وفريقه', en: 'The merchant and their team' }, C: Merchant },
  { id: 'store', name: { ar: 'متجر التاجر', en: 'Storefront' }, who: { ar: 'عميل يتسوق من متجر', en: 'A shopper in one store' }, C: Storefront },
  { id: 'appmaker', name: { ar: 'صانع التطبيقات', en: 'App Maker' }, who: { ar: 'تاجر يبني تطبيق متجره', en: 'A merchant building their app' }, C: AppMaker },
  { id: 'market', name: { ar: 'سوق لك', en: 'LAK marketplace' }, who: { ar: 'عميل يتسوق عبر المتاجر', en: 'A shopper across stores' }, C: Market },
];

const S = {
  ar: { skip: 'تخطَّ إلى المحتوى', surfaces: 'واجهات المنصة', demo: 'بيانات تجريبية', reset: 'إعادة ضبط البيانات', other: 'English',
    hubTitle: 'معاينة تجربة «لك»', hubSub: 'ست واجهات على منظومة واحدة. كل الأرقام والأسماء أمثلة اختبار، والعمليات الخارجية محاكاة ولا تتصل بمنصة لك الحية.', open: 'افتح' },
  en: { skip: 'Skip to content', surfaces: 'Platform surfaces', demo: 'Demo data', reset: 'Reset data', other: 'العربية',
    hubTitle: 'LAK experience preview', hubSub: 'Six surfaces on one platform. All numbers and names are test examples; external operations are simulated and never reach the live LAK platform.', open: 'Open' },
};

export function App() {
  const { lang, setLang } = useLang();
  const t = S[lang];
  const route = useRoute();
  const current = SURFACES.find((s) => s.id === route.path[0]);

  return (
    <>
      <a className="skip" href="#main">{t.skip}</a>
      <header className="topbar">
        <a className="logo" href={link('/')} aria-label="LAK | لك">
          <img src="/lak-mark.png" alt="" width="28" height="40" />
          <bdi dir="ltr" className="wordmark">LAK | لك</bdi>
        </a>
        <nav className="surfaces" aria-label={t.surfaces}>
          {SURFACES.map((s) => (
            <a key={s.id} href={link(`/${s.id}`)} aria-current={current?.id === s.id ? 'page' : undefined}>{s.name[lang]}</a>
          ))}
        </nav>
        <div className="topbar-tools">
          <span className="tag">{t.demo}</span>
          <button type="button" className="btn small" onClick={resetAll}>{t.reset}</button>
          <button type="button" className="btn small" lang={lang === 'ar' ? 'en' : 'ar'} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t.other}</button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {current ? <current.C route={sub(route, 1)} /> : (
          <div className="main hub">
            <header><h1>{t.hubTitle}</h1><p className="muted">{t.hubSub}</p></header>
            <ul className="hub-grid">
              {SURFACES.map((s, n) => (
                <li key={s.id} className="card">
                  <span className="muted small">0{n + 1}</span>
                  <h2>{s.name[lang]}</h2>
                  <p className="muted">{s.who[lang]}</p>
                  <a className="btn" href={link(`/${s.id}`)} aria-label={`${t.open}: ${s.name[lang]}`}>{t.open}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </>
  );
}
