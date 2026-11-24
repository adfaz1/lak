// Domains: the free LAK link and a custom domain connected by DNS records, with verification checks.
import { useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, FlaskConical, Globe2, Link2, XCircle } from 'lucide-react';
import { useReviewMode } from '../../../core/review';
import { settingsStore } from '../../merchant/stores';
import { Badge, Button, IconButton, InfoHint, Segmented, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, SaveBar, Simulated, useToast } from '../../../ds/kit';
import { PLATFORM_HOST, checkDomain, dnsRecords, hostOk, normaliseHost, slugError, type DnsRecord, type DomainCheck } from './model';
import { settingsSimStore } from './stores';
import { LeaveGuard, Section, useSave } from './common';

export default function DomainsPage() {
  return <><FreeLink /><CustomDomain /></>;
}

function FreeLink() {
  const tx = useTx();
  const current = settingsStore.use().domain.slug;
  const [slug, setSlug] = useState(current);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { saving, error, save, clearError } = useSave();
  const err = slugError(slug, current);
  const dirty = slug !== current;
  return (
    <Section id="dm-free" title={tx('رابط المتجر المجاني', 'Free store link')} hint={<InfoHint>{tx('يعمل دائمًا، حتى بعد ربط نطاقك الخاص.', 'Always works, even after you connect your own domain.')}</InfoHint>}
      action={<Badge tone="green">{tx('يعمل', 'Live')}</Badge>}>
      <LeaveGuard dirty={dirty} />
      <Field label={tx('الرابط', 'Link')} hint={tx('حروف إنجليزية صغيرة وأرقام وشرطة، 3–40', 'Lowercase letters, digits, hyphens, 3–40')} error={tried && err === 'format' ? tx('صيغة غير صالحة', 'Invalid format') : null}>
        {(p) => (
          <div dir="ltr" className="flex items-stretch overflow-hidden rounded-xl border border-border focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
            <span className="grid place-items-center bg-surface-2 px-3 text-sm text-muted">{PLATFORM_HOST}/</span>
            <input {...p} value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-')); clearError(); }} className="h-10 min-w-0 flex-1 bg-surface px-3 text-sm text-fg focus:outline-none" />
          </div>
        )}
      </Field>
      {dirty && <p className="mt-3 text-[13px] text-amber-800 dark:text-amber-300">{tx('تغيير الرابط يوقف الرابط القديم الذي شاركته.', 'Changing it stops the old link you have shared.')}</p>}
      <SaveBar dirty={dirty} saving={saving} error={error} onDiscard={() => { setSlug(current); setTried(false); clearError(); }}
        onSave={() => { setTried(true); if (err === 'format') return; setConfirm(true); }} />
      {confirm && (
        <Modal title={tx('تغيير رابط المتجر', 'Change store link')} onClose={() => setConfirm(false)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setConfirm(false); save(() => { settingsStore.set((x) => ({ ...x, domain: { ...x.domain, slug } })); setTried(false); }, tx('تغيّر رابط المتجر', 'Store link changed')); }}>{tx('غيّر الرابط', 'Change link')}</Button></>}>
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">{tx('الحالي', 'Current')}</dt><dd><bdi dir="ltr" className="line-through">{PLATFORM_HOST}/{current}</bdi></dd></div>
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">{tx('الجديد', 'New')}</dt><dd><bdi dir="ltr" className="font-semibold">{PLATFORM_HOST}/{slug}</bdi></dd></div>
          </dl>
          <Alert tone="warn">{tx('الروابط القديمة في الرسائل والإعلانات لن تعمل.', 'Old links in messages and ads will stop working.')}</Alert>
        </Modal>
      )}
    </Section>
  );
}

function CustomDomain() {
  const tx = useTx();
  const toast = useToast();
  const review = useReviewMode();
  const d = settingsStore.use().domain;
  const sim = settingsSimStore.use();
  const [host, setHost] = useState('');
  const [tried, setTried] = useState(false);
  const [checking, setChecking] = useState(false);
  const [last, setLast] = useState<DomainCheck[] | null>(null);
  const [removing, setRemoving] = useState(false);
  const set = (p: Partial<typeof d>) => settingsStore.set((x) => ({ ...x, domain: { ...x.domain, ...p } }));
  const records = d.host ? dnsRecords(d.host) : [];
  const copy = (v: string) => { navigator.clipboard?.writeText(v).then(() => toast({ tone: 'ok', text: tx('نُسخ', 'Copied') }), () => toast({ tone: 'bad', text: tx('تعذّر النسخ؛ انسخ يدويًا', 'Couldn’t copy; copy it manually') })); };
  const check = () => {
    setChecking(true);
    window.setTimeout(() => {
      const found: DnsRecord['type'][] = sim.dns === 'found' || !review ? ['CNAME', 'TXT'] : sim.dns === 'txtMissing' ? ['CNAME'] : [];
      const r = checkDomain(settingsStore.get().domain, found);
      set(r.next); setLast(r.checks); setChecking(false);
    }, 900);
  };
  const badge = d.state === 'verified' ? <Badge tone="green">{tx('متصل', 'Connected')}</Badge> : d.state === 'pending' ? <Badge tone="amber">{tx('بانتظار سجلات DNS', 'Waiting for DNS')}</Badge> : d.state === 'failed' ? <Badge tone="red">{tx('لم نجد السجلات', 'Records not found')}</Badge> : <Badge>{tx('غير مربوط', 'Not connected')}</Badge>;

  return (
    <Section id="dm-own" title={tx('نطاقك الخاص', 'Your own domain')} hint={<InfoHint>{tx('شراء النطاق ونقله وإدارة DNS من اللوحة غير متاحة في هذه النسخة؛ تربط نطاقًا تملكه.', 'Buying, transferring or managing DNS in the dashboard is not available in this version; you connect a domain you own.')}</InfoHint>}
      action={badge}>
      {d.state === 'none' ? (
        <div className="flex flex-wrap items-start gap-3">
          <Field label={tx('النطاق', 'Domain')} className="min-w-0 flex-1 basis-60" error={tried && !hostOk(host) ? tx('أدخل نطاقًا مثل shop.example.com', 'Enter a domain like shop.example.com') : null}>
            {(p) => <Input {...p} dir="ltr" placeholder="shop.example.com" value={host} onChange={(e) => setHost(e.target.value)} />}
          </Field>
          <Button className="mt-7" onClick={() => { setTried(true); if (!hostOk(host)) return; set({ host: normaliseHost(host), state: 'pending' }); setTried(false); setLast(null); }}><Link2 className="size-4" aria-hidden="true" />{tx('اربط النطاق', 'Connect domain')}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-fg"><Globe2 className="size-4 text-muted" aria-hidden="true" /><bdi dir="ltr">{d.host}</bdi>
            {d.state === 'verified' && <a href={`https://${d.host}`} target="_blank" rel="noopener" className="text-muted hover:text-fg" aria-label={tx('افتح', 'Open')}><ExternalLink className="size-3.5" aria-hidden="true" /></a>}</p>
          {d.state !== 'verified' && (
            <>
              <ol className="list-decimal space-y-1.5 ps-5 text-sm text-fg">
                <li>{tx('افتح إعدادات DNS لدى مزوّد نطاقك.', 'Open the DNS settings at your domain provider.')}</li>
                <li>{tx('أضف السجلين كما هما.', 'Add these two records exactly.')}</li>
                <li>{tx('اضغط «افحص الآن». قد يستغرق الانتشار حتى 48 ساعة.', 'Press “Check now”. Propagation can take up to 48 hours.')}</li>
              </ol>
              <div className="scrollbar-thin relative overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[480px] text-[13px]" dir="ltr">
                  <caption className="sr-only">{tx('سجلات DNS المطلوبة', 'Required DNS records')}</caption>
                  <thead><tr className="bg-surface-2/60 text-xs text-muted"><th scope="col" className="px-3 py-2 text-start">Type</th><th scope="col" className="px-3 py-2 text-start">Name</th><th scope="col" className="px-3 py-2 text-start">Value</th><th scope="col" className="w-20 px-3 py-2"><span className="sr-only">{tx('الحالة', 'Status')}</span></th></tr></thead>
                  <tbody>{records.map((r) => {
                    const res = last?.find((c) => c.record === r.type);
                    return (
                      <tr key={r.type} className="border-t border-border">
                        <td className="px-3 py-2 font-semibold">{r.type}</td>
                        <td className="px-3 py-2"><span className="inline-flex items-center gap-1">{r.name}<IconButton className="size-7" label={tx('انسخ الاسم', 'Copy name')} onClick={() => copy(r.name)}><Copy className="size-3.5" aria-hidden="true" /></IconButton></span></td>
                        <td className="px-3 py-2"><span className="inline-flex items-center gap-1 break-all">{r.value}<IconButton className="size-7" label={tx('انسخ القيمة', 'Copy value')} onClick={() => copy(r.value)}><Copy className="size-3.5" aria-hidden="true" /></IconButton></span></td>
                        <td className="px-3 py-2">{res && (res.ok ? <CheckCircle2 className="size-4 text-emerald-600" aria-label={tx('وُجد', 'Found')} /> : <XCircle className="size-4 text-red-600" aria-label={tx('لم يوجد', 'Not found')} />)}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </>
          )}
          {d.state === 'failed' && <Alert tone="bad" title={tx('لم نجد كل السجلات', 'Not all records were found')}>{tx(`الفحص رقم ${d.checks}. تأكد من الاسم والقيمة ثم افحص مجددًا؛ متجرك يعمل على الرابط المجاني.`, `Check #${d.checks}. Confirm the name and value, then check again; your store keeps working on the free link.`)}</Alert>}
          {d.state === 'verified' && <Alert tone="ok" title={tx('النطاق متصل', 'Domain connected')}>{tx('الرابط المجاني يبقى يعمل ويحوّل إلى نطاقك.', 'The free link keeps working and redirects to your domain.')}</Alert>}
          <div className="flex flex-wrap items-center gap-2">
            {d.state !== 'verified' && <Button onClick={check} disabled={checking}>{checking ? tx('جارٍ الفحص…', 'Checking…') : tx('افحص الآن', 'Check now')}</Button>}
            <Button variant="ghost" onClick={() => setRemoving(true)}>{tx('أزل النطاق', 'Remove domain')}</Button>
            <Simulated />
          </div>
          {review && d.state !== 'verified' && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2">
              <FlaskConical className="size-4 text-muted" aria-hidden="true" /><span className="text-xs font-semibold text-muted">{tx('نتيجة الفحص التالي', 'Next check result')}</span>
              <Segmented label={tx('نتيجة الفحص', 'Check result')} value={sim.dns} onChange={(v) => settingsSimStore.set((s) => ({ ...s, dns: v }))}
                options={[{ value: 'found', label: tx('وُجدت', 'Found') }, { value: 'txtMissing', label: tx('TXT ناقص', 'TXT missing') }, { value: 'none', label: tx('لا شيء', 'None') }]} />
            </div>
          )}
        </div>
      )}
      {removing && (
        <Modal title={tx('إزالة النطاق', 'Remove domain')} onClose={() => setRemoving(false)} description={tx('يتوقف نطاقك عن فتح المتجر. الرابط المجاني يبقى يعمل.', 'Your domain stops opening the store. The free link keeps working.')}
          footer={<><Button variant="secondary" onClick={() => setRemoving(false)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => { set({ host: '', state: 'none', checks: 0 }); setHost(''); setLast(null); setRemoving(false); }}>{tx('أزل النطاق', 'Remove domain')}</Button></>} />
      )}
    </Section>
  );
}
