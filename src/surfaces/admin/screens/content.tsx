// Theme & app review (`#/admin/content?state=<s>`): checks, scopes, installs; approve / reject / suspend / reinstate.
import { useState } from 'react';
import { Blocks, CheckCircle2, Palette, Puzzle, Users, XCircle } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { PageHeader, Tabs, useToast } from '../../../ds/kit';
import { Badge, Button, Card, EmptyState, InfoHint, LinkButton, Ref, cn, useTx, type Tone } from '../../../ds/ui';
import { can, modActions, type ModAction, type ReviewState, type Submission } from '../domain';
import { ERR, MOD_ACTION, REVIEW_STATE } from '../i18n';
import { contentStore, moderateItem } from '../state';
import { ahref, ImpactList, Locked, qhref, ReasonModal, StateGate, useFmt, useViewState } from '../ui';
import type { ScreenProps } from '../index';

const TONE: Record<ReviewState, Tone> = { review: 'amber', approved: 'green', rejected: 'red', suspended: 'red' };

export default function Content({ role, route }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const toast = useToast();
  const state = useViewState();
  const stored = contentStore.use();
  const items = state === 'empty' ? [] : stored;
  const raw = route.query.get('state') ?? '';
  const st = (['review', 'approved', 'rejected', 'suspended'] as string[]).includes(raw) ? (raw as ReviewState) : '';
  const rows = items.filter((s) => !st || s.state === st);
  const [dlg, setDlg] = useState<{ s: Submission; a: ModAction } | null>(null);
  const mayMod = can(role, 'content.moderate');

  const header = (
    <>
      <PageHeader title={tx('مراجعة الثيمات والتطبيقات', 'Theme & app review')}
        description={<span className="inline-flex items-center gap-1">{tx('التعليق يؤثر على التجار الذين ثبّتوها', 'Suspending affects merchants who installed it')}<InfoHint>{tx('مركز المساعدة والصفحات الثابتة والمدونة ودليل المؤثرين لم تُبنَ في هذه النسخة.', 'Help center, static pages, blog and influencer directory are not built in this version.')}</InfoHint></span>} />
      <Tabs label={tx('العروض المحفوظة', 'Saved views')} items={(['', 'review', 'approved', 'rejected', 'suspended'] as (ReviewState | '')[]).map((s) => ({
        href: qhref('content', route, { state: s || undefined }), label: s ? REVIEW_STATE[s][lang] : tx('الكل', 'All'), current: s === st, count: items.filter((x) => !s || x.state === s).length,
      }))} />
    </>
  );
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={header} what={{ ar: 'طابور المراجعة', en: 'The review queue' }} refCode="SIM-ADM-CNT-503" kind="cards" />;

  const scope = (s: Submission, a: ModAction) => ({
    approve: { icon: <CheckCircle2 />, text: tx('تُنشر هذه النسخة في متجر الثيمات والتطبيقات ويستطيع التجار تثبيتها.', 'Publishes this version; merchants can install it.') },
    reject: { icon: <XCircle />, text: tx('تعود للمطوّر مع سببك. لا يُنشر شيء.', 'Returns to the developer with your reason. Nothing is published.') },
    suspend: { icon: <Users />, text: tx(`تُخفى من المتجر. ${s.installs} تاجرًا ثبّتوها تبقى بياناتهم ويتوقف عملها في متاجرهم.`, `Hidden from the store. ${s.installs} merchants who installed it keep their data; it stops running in their stores.`), tone: 'warn' as const },
    reinstate: { icon: <Users />, text: tx(`تعود متاحة لـ ${s.installs} تاجرًا مثبّتًا وللتثبيت الجديد.`, `Available again to ${s.installs} installed merchants and new installs.`) },
  })[a];

  return (
    <div className="space-y-6">
      {header}
      {!mayMod && <Locked>{tx('دورك يعرض الطابور ولا يتخذ قرارات.', 'Your role can view the queue but not decide.')}</Locked>}
      {rows.length === 0 ? (
        <Card><EmptyState as="h2" icon={<Blocks className="size-6" />} title={items.length === 0 ? tx('لا ثيمات أو تطبيقات مقدّمة', 'No themes or apps submitted') : tx('لا عناصر في هذا العرض', 'Nothing in this view')}
          action={items.length ? <LinkButton variant="secondary" href={ahref('content')}>{tx('الكل', 'All')}</LinkButton> : undefined} /></Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((s) => {
            const failed = s.checks.some((c) => !c.ok);
            const acts = modActions(s);
            const Icon = s.kind === 'theme' ? Palette : Puzzle;
            return (
              <li key={s.id}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-start gap-3 px-5 pt-5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300" aria-hidden="true"><Icon className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[15px] font-semibold text-fg">{s.name[lang]} <span className="text-xs font-normal text-muted"><Ref>v{s.version}</Ref></span></h2>
                      <p className="text-xs text-muted">{s.kind === 'theme' ? tx('ثيم', 'Theme') : tx('تطبيق', 'App')} · {s.developer[lang]} · {f.d(s.submitted)} · {tx(`${s.installs} تثبيت`, `${s.installs} installs`)}</p>
                    </div>
                    <Badge tone={TONE[s.state]}>{REVIEW_STATE[s.state][lang]}</Badge>
                  </div>
                  <div className="flex-1 space-y-3 px-5 py-4">
                    <ul className="flex flex-wrap gap-1.5" aria-label={tx('نتائج الفحص', 'Check results')}>
                      {s.checks.map((c) => <li key={c.label.en}><Badge tone={c.ok ? 'green' : 'red'} icon={c.ok ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <XCircle className="size-3.5" aria-hidden="true" />}>{c.label[lang]}<span className="sr-only">{c.ok ? tx(': ناجح', ': passed') : tx(': فشل', ': failed')}</span></Badge></li>)}
                    </ul>
                    {s.scopes.length > 0 && <p className="text-xs text-muted"><span className="font-semibold text-fg">{tx('الصلاحيات المطلوبة', 'Requested scopes')}:</span> {s.scopes.map((x) => x[lang]).join(lang === 'ar' ? '، ' : ', ')}</p>}
                    {s.note && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{tx('آخر ملاحظة', 'Last note')}: «{s.note}»</p>}
                  </div>
                  {mayMod && acts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
                      {acts.map((a) => (
                        <Button key={a} size="sm" variant={a === 'approve' || a === 'reinstate' ? 'primary' : 'secondary'} disabled={a === 'approve' && failed}
                          aria-describedby={a === 'approve' && failed ? `cf-${s.id}` : undefined} onClick={() => setDlg({ s, a })}
                          className={cn((a === 'reject' || a === 'suspend') && 'text-red-700 dark:text-red-400')}>{MOD_ACTION[a][lang]}</Button>
                      ))}
                      {s.state === 'review' && failed && <p id={`cf-${s.id}`} className="basis-full text-xs text-muted">{ERR.checksFailed[lang]}</p>}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {dlg && (
        <ReasonModal title={`${MOD_ACTION[dlg.a][lang]}: ${dlg.s.name[lang]}`} confirmLabel={MOD_ACTION[dlg.a][lang]} danger={dlg.a === 'reject' || dlg.a === 'suspend'} optional={dlg.a === 'approve'} onClose={() => setDlg(null)}
          target={<><p className="font-semibold text-fg">{dlg.s.name[lang]} · <Ref>v{dlg.s.version}</Ref></p><p className="text-xs text-muted">{dlg.s.developer[lang]}</p></>}
          onConfirm={(r) => { const e = moderateItem(dlg.s.id, dlg.a, r); if (!e) toast({ tone: 'ok', text: `${MOD_ACTION[dlg.a][lang]}: ${dlg.s.name[lang]}` }); return e; }}>
          <ImpactList items={[scope(dlg.s, dlg.a)]} />
        </ReasonModal>
      )}
    </div>
  );
}
