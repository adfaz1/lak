import { Suspense, lazy, useEffect, useState, type ComponentType } from 'react';
import { useLang, type L } from './core/lang';
import { link, sub, useRoute, type Route } from './core/router';
import { resetAll } from './core/store';
import { syncReviewMode, useReviewMode, fromRedesignStore } from './core/review';

// Each surface is its own chunk so opening one does not download the other five.
const Site = lazy(() => import('./surfaces/site'));
const Admin = lazy(() => import('./surfaces/admin'));
const Merchant = lazy(() => import('./surfaces/merchant'));
const Storefront = lazy(() => import('./surfaces/storefront'));
const AppMaker = lazy(() => import('./surfaces/appmaker'));
const Market = lazy(() => import('./surfaces/market'));
const V2 = lazy(() => import('./surfaces/v2'));
const Dashboard = lazy(() => import('./surfaces/dashboard'));

/** The six surfaces of the platform blueprint, in dependency order. */
const SURFACES: { id: string; name: L; who: L; C: ComponentType<{ route: Route }> }[] = [
  { id: 'site', name: { ar: 'موقع لك', en: 'LAK website' }, who: { ar: 'زائر يفكر في فتح متجر', en: 'A visitor considering a store' }, C: Site },
  { id: 'admin', name: { ar: 'إدارة المنصة', en: 'Platform admin' }, who: { ar: 'فريق تشغيل لك', en: 'LAK operations team' }, C: Admin },
  { id: 'merchant', name: { ar: 'لوحة التاجر', en: 'Merchant workspace' }, who: { ar: 'التاجر وفريقه', en: 'The merchant and their team' }, C: Merchant },
  { id: 'store', name: { ar: 'متجر التاجر', en: 'Storefront' }, who: { ar: 'عميل يتسوق من متجر', en: 'A shopper in one store' }, C: Storefront },
  { id: 'appmaker', name: { ar: 'صانع التطبيقات', en: 'App Maker' }, who: { ar: 'تاجر يبني تطبيق متجره', en: 'A merchant building their app' }, C: AppMaker },
  { id: 'market', name: { ar: 'سوق لك', en: 'LAK marketplace' }, who: { ar: 'عميل يتسوق عبر المتاجر', en: 'A shopper across stores' }, C: Market },
  { id: 'dashboard', name: { ar: 'لوحة التاجر الجديدة · للاعتماد', en: 'New merchant dashboard · for approval' }, who: { ar: 'مرجع الجودة: رئيسية التاجر', en: 'Quality reference: merchant home' }, C: Dashboard },
  { id: 'v2', name: { ar: 'التصميم الجديد · للاعتماد', en: 'New design · for approval' }, who: { ar: 'ثلاث شاشات لاعتماد المستوى البصري قبل تعميمه', en: 'Three screens to approve the visual standard before rollout' }, C: V2 },
];

const S = {
  ar: { skip: 'تخطَّ إلى المحتوى', surfaces: 'واجهات المنصة', demo: 'بيانات تجريبية', reset: 'إعادة ضبط البيانات', other: 'English',
    loading: 'جارٍ تحميل الواجهة…', dirA: 'الاتجاه A', dirB: 'الاتجاه B', hubTitle: 'معاينة تجربة «لك»', hubSub: 'ست واجهات على منظومة واحدة. كل الأرقام والأسماء أمثلة اختبار، والعمليات الخارجية محاكاة ولا تتصل بمنصة لك الحية.', open: 'افتح' },
  en: { skip: 'Skip to content', surfaces: 'Platform surfaces', demo: 'Demo data', reset: 'Reset data', other: 'العربية',
    loading: 'Loading this surface…', dirA: 'Direction A', dirB: 'Direction B', hubTitle: 'LAK experience preview', hubSub: 'Six surfaces on one platform. All numbers and names are test examples; external operations are simulated and never reach the live LAK platform.', open: 'Open' },
};

export function App() {
  const { lang, setLang } = useLang();
  const t = S[lang];
  const route = useRoute();
  const current = SURFACES.find((s) => s.id === route.path[0]);
  const [direction, setDirection] = useState<'a' | 'b'>(() => {
    try { return localStorage.getItem('lak.direction') === 'b' ? 'b' : 'a'; } catch { return 'a'; }
  });
  useEffect(() => { document.documentElement.dataset.surface = current?.id ?? 'hub'; }, [current?.id]);
  useEffect(() => syncReviewMode(route.query), [route]);
  const review = useReviewMode();
  const fromRedesign = fromRedesignStore.use();
  useEffect(() => {
    if (route.query.get('from') === 'v2') fromRedesignStore.set(true);
    else if (current?.id === 'v2' || current?.id === 'dashboard') fromRedesignStore.set(false);
  }, [route, current?.id]);
  // The redesign is shown as the product: no prototype chrome unless review mode is on.
  const bare = (current?.id === 'v2' || current?.id === 'dashboard') && !review;
  useEffect(() => {
    document.documentElement.dataset.direction = direction;
    try { localStorage.setItem('lak.direction', direction); } catch { /* preference only */ }
  }, [direction]);

  return (
    <>
      <a className="skip" href="#main">{t.skip}</a>
      {!bare && <header className="topbar">
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
          {current?.id === 'merchant' && (
            <button type="button" className="btn small" aria-pressed={direction === 'b'} title={lang === 'ar' ? 'بدّل بين اتجاهي التصميم للمقارنة' : 'Switch between the two design directions to compare'} onClick={() => setDirection(direction === 'a' ? 'b' : 'a')}>
              {direction === 'a' ? t.dirA : t.dirB}
            </button>
          )}
          <button type="button" className="btn small" onClick={resetAll}>{t.reset}</button>
          <button type="button" className="btn small" lang={lang === 'ar' ? 'en' : 'ar'} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t.other}</button>
        </div>
      </header>}
      {fromRedesign && current?.id === 'merchant' && (
        <div className="legacy-bar" role="status">
          <span>{lang === 'ar' ? 'هذا القسم بالإصدار السابق ولم يُعَد تصميمه بعد.' : 'This section is still the previous version; it has not been redesigned yet.'}</span>
          <a href={link('/dashboard')}>{lang === 'ar' ? 'العودة إلى اللوحة الجديدة' : 'Back to the new dashboard'}</a>
        </div>
      )}
      <main id="main" tabIndex={-1}>
        {current ? <Suspense fallback={<div className="main" aria-busy="true"><p className="muted" role="status">{t.loading}</p></div>}><current.C route={sub(route, 1)} /></Suspense> : (
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
