/**
 * Page SEO editor, browser side.
 *
 * The same analyser the post editor uses, run against the page's ported text
 * instead of an editable body. The text is fixed here — you cannot change a
 * page's content from this screen — so the score moves only with the title,
 * description and focus keyword, which is exactly what is being tuned.
 */
import { analyse, type SeoCheck, type SeoReport } from '../lib/seo';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

const form = $<HTMLFormElement>('ps-form');
if (form) {
  const bodyText = ($<HTMLTextAreaElement>('ps-body')?.value ?? '').trim();
  const slug = (form.querySelector('[name="slug"]') as HTMLInputElement).value;
  const focus = $<HTMLInputElement>('ed-focus')!;
  const seoTitle = $<HTMLInputElement>('ed-seotitle')!;
  const metaDesc = $<HTMLTextAreaElement>('ed-metadesc')!;
  const scoreEl = $<HTMLElement>('ed-score')!;
  const checksEl = $<HTMLElement>('ed-checks')!;
  const flash = $<HTMLElement>('ed-flash')!;

  /* The placeholder holds what the page serves today, so an empty field is
     scored on the value that is actually live rather than on nothing. */
  const effectiveTitle = () => seoTitle.value || seoTitle.placeholder || '';
  const effectiveDesc = () => metaDesc.value || metaDesc.placeholder || '';

  const GROUPS: Record<string, string> = {
    basic: 'Basic SEO',
    additional: 'Additional',
    'title-readability': 'Title readability',
    'content-readability': 'Content readability',
  };

  const setCount = (id: string, value: number, min: number, max: number) => {
    const el = $<HTMLElement>(id);
    if (!el) return;
    el.textContent = `${value} / ${max}`;
    el.classList.toggle('over', value > max || (value > 0 && value < min));
  };

  const render = (report: SeoReport) => {
    scoreEl.querySelector('b')!.textContent = String(report.score);
    scoreEl.dataset.band = report.score >= 80 ? 'good' : report.score >= 50 ? 'ok' : 'bad';

    checksEl.textContent = '';
    let group = '';
    for (const check of report.checks as SeoCheck[]) {
      if (check.group !== group) {
        group = check.group;
        const head = document.createElement('li');
        head.className = 'grouphead';
        head.textContent = GROUPS[group] ?? group;
        checksEl.appendChild(head);
      }
      const li = document.createElement('li');
      li.className = check.status;
      const dot = document.createElement('span');
      dot.className = 'dot';
      const label = document.createElement('span');
      // textContent: the label quotes the author's own keyword back at them.
      label.textContent = check.label;
      li.append(dot, label);
      checksEl.appendChild(li);
    }
    setCount('c-seotitle', report.stats.titleLength, 15, 60);
    setCount('c-metadesc', report.stats.descriptionLength, 70, 160);
  };

  const run = () => {
    const title = effectiveTitle();
    const desc = effectiveDesc();
    $<HTMLElement>('serp-title')!.textContent = title.length > 60 ? title.slice(0, 59) + '…' : title;
    $<HTMLElement>('serp-desc')!.textContent = desc.length > 160 ? desc.slice(0, 159) + '…' : desc;
    $<HTMLElement>('serp-slug')!.textContent = slug || '';

    render(
      analyse({
        title,
        seoTitle: title,
        description: desc,
        slug,
        /* The analyser expects markup and strips it; this text has none, which
           is harmless — the checks that look for headings, links and images
           simply report their absence, and on a page whose content is not
           editable here that is honest rather than misleading. */
        bodyHtml: bodyText,
        focusKeyword: focus.value,
      }),
    );
  };

  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 250);
  };
  for (const el of [focus, seoTitle, metaDesc]) el.addEventListener('input', schedule);
  run();

  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((t) => t.classList.remove('on'));
      tab.classList.add('on');
      document.querySelectorAll<HTMLElement>('.tab').forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    flash.textContent = 'Saving…';
    flash.className = 'alert alert--ok';
    flash.hidden = false;
    try {
      const r = await fetch(form.action, { method: 'POST', body: new FormData(form) });
      const out = (await r.json()) as { ok?: boolean; error?: string; score?: number };
      if (!r.ok || !out.ok) {
        flash.textContent = out.error || 'Could not save.';
        flash.className = 'alert alert--error';
        return;
      }
      flash.textContent = `Saved. Score ${out.score}. It reaches the site at the next build.`;
      flash.className = 'alert alert--ok';
    } catch {
      flash.textContent = 'Could not reach the server. Your changes are still here — try again.';
      flash.className = 'alert alert--error';
    } finally {
      if (button) button.disabled = false;
    }
  });
}
