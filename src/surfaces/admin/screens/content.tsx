import { useCallback, useState } from 'react';
import { formatInt } from '../../../core/format';
import { Badge, Id, LinkTabs, PageHeader, type Tone } from '../../../core/ui';
import { can, modActions, type ModAction, type ReviewState, type Submission } from '../domain';
import { ERR, MOD_ACTION, REVIEW_STATE } from '../i18n';
import { flash, fmtDate, Icon, Locked, ReasonDialog, withQuery, type Ctx } from '../kit';
import { contentStore, moderateItem } from '../state';

const TONE: Record<ReviewState, Tone> = { review: 'warning', approved: 'success', rejected: 'danger', suspended: 'danger' };

export default function Content({ t, lang, role, route }: Ctx) {
  const items = contentStore.use();
  const state = (route.query.get('state') ?? '') as ReviewState | '';
  const rows = items.filter((s) => !state || s.state === state);
  const [dlg, setDlg] = useState<{ s: Submission; a: ModAction } | null>(null);
  const close = useCallback(() => setDlg(null), []);
  const mayMod = can(role, 'content.moderate');
  const scope = (s: Submission, a: ModAction) =>
    a === 'approve' ? t.modScopeApprove : a === 'reject' ? t.modScopeReject : a === 'suspend' ? t.modScopeSuspend(s.installs) : t.modScopeReinstate(s.installs);

  return (
    <>
      <PageHeader title={t.contentTitle} sub={t.contentSub} />
      <LinkTabs label={t.status} items={(['', 'review', 'approved', 'rejected', 'suspended'] as (ReviewState | '')[]).map((s) => ({
        href: withQuery('/content', route, { state: s || undefined }), current: s === state,
        label: <>{s ? REVIEW_STATE[s][lang] : t.all} <span className="adm-chip-n">{items.filter((x) => !s || x.state === s).length}</span></>,
      }))} />
      {!mayMod && <Locked>{t.noMod}</Locked>}
      {rows.length === 0 ? <div className="card"><div className="empty">{t.noResults}</div></div> : (
        <ul className="adm-cards adm-cards-grid">
          {rows.map((s) => {
            const failed = s.checks.some((c) => !c.ok);
            return (
              <li key={s.id} className="card">
                <div className="card-head">
                  <h2>{s.name[lang]} <span className="muted small"><Id>v{s.version}</Id></span></h2>
                  <Badge tone={TONE[s.state]}>{REVIEW_STATE[s.state][lang]}</Badge>
                </div>
                <div className="card-body">
                  <p className="small muted">{s.kind === 'theme' ? t.theme : t.app} · {t.developer}: {s.developer[lang]} · {t.submitted} {fmtDate(s.submitted, lang)} · {t.installs}: {formatInt(s.installs)}</p>
                  <div>
                    <h3 className="adm-h3">{t.checks}</h3>
                    <ul className="adm-checks">
                      {s.checks.map((c) => (
                        <li key={c.label.en} className={c.ok ? 'ok' : 'bad'}><Icon name={c.ok ? 'check' : 'x'} size={16} />
                          <span>{c.label[lang]}</span><span className="sr">{c.ok ? '✓' : '✗'}</span></li>
                      ))}
                    </ul>
                  </div>
                  {s.scopes.length > 0 && <p className="small"><b>{t.scopes}:</b> {s.scopes.map((x) => x[lang]).join(lang === 'ar' ? '، ' : ', ')}</p>}
                  {s.note && <p className="small"><b>{t.lastNote}:</b> {s.note}</p>}
                  {mayMod && modActions(s).length > 0 && (
                    <div className="actions">
                      {modActions(s).map((a) => (
                        <button key={a} type="button" className={`btn ${a === 'approve' || a === 'reinstate' ? 'primary' : 'adm-danger-outline'}`}
                          disabled={a === 'approve' && failed} aria-describedby={a === 'approve' && failed ? `cf-${s.id}` : undefined}
                          onClick={() => setDlg({ s, a })}>{MOD_ACTION[a][lang]}</button>
                      ))}
                    </div>
                  )}
                  {mayMod && s.state === 'review' && failed && <p id={`cf-${s.id}`} className="small muted">{ERR.checksFailed[lang]}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small">{t.helpCenter}</p>
      {dlg && (
        <ReasonDialog t={t} lang={lang} title={`${MOD_ACTION[dlg.a][lang]}: ${dlg.s.name[lang]}`} confirmLabel={MOD_ACTION[dlg.a][lang]}
          danger={dlg.a === 'reject' || dlg.a === 'suspend'} optional={dlg.a === 'approve'} onClose={close}
          scope={<><p className="strong">{dlg.s.name[lang]} · <Id>v{dlg.s.version}</Id></p><p>{scope(dlg.s, dlg.a)}</p></>}
          onConfirm={(r) => { const e = moderateItem(dlg.s.id, dlg.a, r); if (!e) flash(`${MOD_ACTION[dlg.a][lang]}: ${dlg.s.name[lang]}`); return e; }} />
      )}
    </>
  );
}
