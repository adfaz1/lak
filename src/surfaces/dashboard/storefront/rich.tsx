// A small rich-text editor for store pages: heading, bold and list buttons that write a safe markup subset
// (see content.ts toBlocks), with a preview rendered exactly as the store renders it.
import { useRef, useState } from 'react';
import { Bold, Eye, Heading2, List, Pencil } from 'lucide-react';
import { cn, useTx } from '../../../ds/ui';
import { inputClass } from '../../../ds/kit';
import { inlineRuns, toBlocks } from './content';

export function RichView({ src, className }: { src: string; className?: string }) {
  const runs = (t: string) => inlineRuns(t).map((r, i) => (r.bold ? <strong key={i} className="font-semibold text-fg">{r.text}</strong> : <span key={i}>{r.text}</span>));
  const blocks = toBlocks(src);
  if (!blocks.length) return <p className={cn('text-sm text-subtle', className)}>—</p>;
  return (
    <div className={cn('space-y-3 text-sm leading-relaxed text-fg/90', className)}>
      {blocks.map((b, i) => b.type === 'h' ? <h3 key={i} className="text-[15px] font-bold text-fg">{runs(b.text)}</h3>
        : b.type === 'ul' ? <ul key={i} className="list-disc space-y-1 ps-5">{b.items.map((x, j) => <li key={j}>{runs(x)}</li>)}</ul>
          : <p key={i}>{runs(b.text)}</p>)}
    </div>
  );
}

export function RichEditor({ id, value, onChange, lang, label, invalid }: { id: string; value: string; onChange: (v: string) => void; lang: 'ar' | 'en'; label: string; invalid?: boolean }) {
  const tx = useTx();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const wrap = (kind: 'h' | 'b' | 'ul') => {
    const el = ref.current;
    const s = el?.selectionStart ?? value.length;
    const e = el?.selectionEnd ?? value.length;
    const sel = value.slice(s, e);
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    let next = value;
    let caret = e;
    if (kind === 'b') { const t = sel || (lang === 'ar' ? 'نص عريض' : 'bold text'); next = `${value.slice(0, s)}**${t}**${value.slice(e)}`; caret = s + t.length + 4; }
    else {
      const mark = kind === 'h' ? '## ' : '- ';
      next = `${value.slice(0, lineStart)}${mark}${value.slice(lineStart)}`; caret = e + mark.length;
    }
    onChange(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
  };
  const tool = (k: 'h' | 'b' | 'ul', I: typeof Bold, name: string) => (
    <button type="button" onClick={() => wrap(k)} disabled={preview} title={name} aria-label={name}
      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"><I className="size-4" aria-hidden="true" /></button>
  );
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-surface', invalid ? 'border-red-500' : 'border-border')}>
      <div className="flex items-center gap-0.5 border-b border-border bg-surface-2/50 px-1.5 py-1" role="toolbar" aria-label={tx(`تنسيق ${label}`, `Format ${label}`)}>
        {tool('h', Heading2, tx('عنوان فرعي', 'Subheading'))}
        {tool('b', Bold, tx('عريض', 'Bold'))}
        {tool('ul', List, tx('قائمة نقطية', 'Bulleted list'))}
        <button type="button" onClick={() => setPreview((p) => !p)} aria-pressed={preview}
          className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-fg">
          {preview ? <Pencil className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}{preview ? tx('تحرير', 'Edit') : tx('معاينة', 'Preview')}
        </button>
      </div>
      {preview ? <div className="min-h-40 p-3" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}><RichView src={value} /></div>
        : <textarea ref={ref} id={id} aria-label={label} aria-invalid={invalid || undefined} rows={9} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} value={value} onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, 'h-auto min-h-40 rounded-none border-0 py-2.5 leading-relaxed shadow-none focus:ring-0')} placeholder={lang === 'ar' ? 'اكتب محتوى الصفحة…' : 'Write the page content…'} />}
    </div>
  );
}
