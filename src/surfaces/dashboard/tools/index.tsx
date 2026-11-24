// Tool directory (`#/dashboard/tools`): every merchant tool in one searchable place, grouped,
// with favourites and recently used. Opening a tool goes to its own page in context.
import { useMemo } from 'react';
import { ArrowLeft, ArrowRight, Clock, SearchX, Star } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { replace, type Route } from '../../../core/router';
import { testStore } from '../../merchant/stores';
import { Card, EmptyState, cn, useTx } from '../../../ds/ui';
import { FilterChip, PageHeader, SearchInput } from '../../../ds/kit';
import { GROUPS, TOOLS, canUseTool, toolById, type Tool, type ToolGroup } from '../model/tools';
import { toolHits } from '../model/search';
import { dhref } from '../shell';
import { toggleFavourite, useFavourites, useRecentTools } from '../prefs';

export default function Tools({ route }: { route: Route }) {
  const { lang } = useLang();
  const tx = useTx();
  const role = testStore.use().role;
  const fav = useFavourites();
  const recent = useRecentTools();
  const q = route.query.get('q') ?? '';
  const g = (route.query.get('g') ?? '') as ToolGroup | '';
  const set = (o: Record<string, string | undefined>) => replace(dhref('tools', { q: q || undefined, g: g || undefined, ...o }));

  const allowed = useMemo(() => TOOLS.filter((x) => canUseTool(x, role)), [role]);
  const shown = useMemo(() => {
    const ids = q.trim() ? new Set(toolHits(q, role).map((h) => h.id)) : null;
    return allowed.filter((x) => (!ids || ids.has(x.id)) && (!g || x.group === g));
  }, [allowed, q, g, role]);
  const pick = (ids: string[]) => ids.map(toolById).filter((x): x is Tool => !!x && canUseTool(x, role));
  const favTools = pick(fav);
  const recentTools = pick(recent).slice(0, 6);
  const filtering = !!q.trim() || !!g;

  return (
    <div className="space-y-6">
      <PageHeader title={tx('كل الأدوات', 'All tools')} description={tx(`${allowed.length} أداة متاحة لدورك · ثبّت ما تستخدمه كثيرًا بالنجمة`, `${allowed.length} tools for your role · star the ones you use often`)} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full sm:w-auto sm:flex-1 sm:max-w-md"><SearchInput value={q} onChange={(v) => set({ q: v || undefined })} placeholder={tx('ابحث عن أداة أو إعداد', 'Search a tool or setting')} /></div>
        <FilterChip label={tx('المجموعة', 'Group')} value={g || 'all'} onChange={(v) => set({ g: v === 'all' ? undefined : v })}
          options={[{ value: 'all', label: tx('الكل', 'All') }, ...GROUPS.map((x) => ({ value: x.id, label: x.label[lang] }))]} />
      </div>

      {!filtering && (favTools.length > 0 || recentTools.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {favTools.length > 0 && <Strip title={tx('المفضلة', 'Favourites')} icon={<Star className="size-4 fill-current text-amber-500" aria-hidden="true" />} tools={favTools} fav={fav} />}
          {recentTools.length > 0 && <Strip title={tx('استخدمتها مؤخرًا', 'Recently used')} icon={<Clock className="size-4 text-muted" aria-hidden="true" />} tools={recentTools} fav={fav} />}
        </div>
      )}

      {shown.length === 0 ? (
        <Card><EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا أداة بهذا الاسم', 'No tool by that name')}
          action={<button type="button" onClick={() => set({ q: undefined, g: undefined })} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('امسح البحث', 'Clear search')}</button>}>
          {tx('جرّب كلمة أخرى بالعربية أو الإنجليزية، مثل «شحن» أو «coupon».', 'Try another word in Arabic or English, like “shipping” or «كوبون».')}
        </EmptyState></Card>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((grp) => {
            const items = shown.filter((x) => x.group === grp.id);
            if (!items.length) return null;
            return (
              <section key={grp.id} aria-labelledby={`tg-${grp.id}`}>
                <h2 id={`tg-${grp.id}`} className="mb-3 text-sm font-semibold text-muted">{grp.label[lang]}</h2>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((x) => <li key={x.id}><ToolCard tool={x} fav={fav.includes(x.id)} /></li>)}</ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Strip({ title, icon, tools, fav }: { title: string; icon: React.ReactNode; tools: Tool[]; fav: string[] }) {
  const { lang } = useLang();
  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">{icon}{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {tools.map((x) => (
          <li key={x.id}><a href={dhref(x.path, x.query)} className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm font-medium text-fg hover:border-brand-300', fav.includes(x.id) && 'border-amber-300/70')}>{x.label[lang]}</a></li>
        ))}
      </ul>
    </Card>
  );
}

function ToolCard({ tool, fav }: { tool: Tool; fav: boolean }) {
  const { lang } = useLang();
  const tx = useTx();
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <div className="group relative flex h-full items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-brand-300">
      <a href={dhref(tool.path, tool.query)} className="min-w-0 flex-1 after:absolute after:inset-0 after:content-['']">
        <span className="flex items-center gap-1.5 font-semibold text-fg">{tool.label[lang]}<Arrow className="size-3.5 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" /></span>
        <span className="mt-1 block text-sm text-muted">{tool.desc[lang]}</span>
      </a>
      <button type="button" onClick={() => toggleFavourite(tool.id)} aria-pressed={fav}
        aria-label={fav ? tx(`إزالة «${tool.label.ar}» من المفضلة`, `Remove “${tool.label.en}” from favourites`) : tx(`تثبيت «${tool.label.ar}» في المفضلة`, `Add “${tool.label.en}” to favourites`)}
        className="relative z-10 grid size-9 shrink-0 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-fg">
        <Star className={cn('size-[18px]', fav && 'fill-amber-400 text-amber-500')} aria-hidden="true" />
      </button>
    </div>
  );
}
