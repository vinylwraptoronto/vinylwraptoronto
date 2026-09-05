/**
 * The post editor, browser side.
 *
 * Astro bundles this to /_astro/*.js, so the admin's CSP stays at
 * script-src 'self' with no inline script and nothing loaded from a CDN.
 *
 * The formatting commands use document.execCommand. It is deprecated and the
 * replacement is to hand-roll Selection/Range editing, which is a large amount
 * of fragile code to write badly. Every browser still implements it, the
 * output is ordinary HTML that the server sanitises on save anyway, and if it
 * is ever withdrawn the HTML view below is a complete fallback — so the
 * trade is a deliberate one rather than an oversight.
 */
import { analyse, slugify, type SeoCheck, type SeoReport } from '../lib/seo';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

const form = $<HTMLFormElement>('ed-form');
if (form) {
  const body = $<HTMLElement>('ed-body')!;
  const htmlView = $<HTMLTextAreaElement>('ed-html')!;
  const bodyInput = $<HTMLInputElement>('ed-body-input')!;
  const titleInput = form.querySelector<HTMLInputElement>('[name="title"]')!;
  const slugInput = $<HTMLInputElement>('ed-slug')!;
  const focusInput = $<HTMLInputElement>('ed-focus')!;
  const seoTitle = $<HTMLInputElement>('ed-seotitle')!;
  const metaDesc = $<HTMLTextAreaElement>('ed-metadesc')!;
  const excerpt = $<HTMLTextAreaElement>('ed-excerpt')!;
  const flash = $<HTMLElement>('ed-flash')!;

  /* ---------- body <-> hidden input ---------- */

  let sourceMode = false;

  const currentHtml = () => (sourceMode ? htmlView.value : body.innerHTML);

  const syncOut = () => {
    bodyInput.value = currentHtml();
  };

  $<HTMLButtonElement>('ed-source')?.addEventListener('click', () => {
    sourceMode = !sourceMode;
    if (sourceMode) {
      htmlView.value = body.innerHTML;
      htmlView.hidden = false;
      body.hidden = true;
    } else {
      body.innerHTML = htmlView.value;
      htmlView.hidden = true;
      body.hidden = false;
    }
    $<HTMLButtonElement>('ed-source')!.setAttribute('aria-pressed', String(sourceMode));
    schedule();
  });

  /* ---------- toolbar ---------- */

  document.querySelectorAll<HTMLButtonElement>('.toolbar button[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      body.focus();
      document.execCommand(btn.dataset.cmd!, false);
      schedule();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.toolbar button[data-block]').forEach((btn) => {
    btn.addEventListener('click', () => {
      body.focus();
      document.execCommand('formatBlock', false, btn.dataset.block!);
      schedule();
    });
  });

  document.querySelector<HTMLButtonElement>('[data-link]')?.addEventListener('click', () => {
    const href = window.prompt('Link to (a full URL, or a path like /car-wraps/)');
    if (!href) return;
    // Only ever insert a scheme we are willing to render.
    if (!/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href.trim())) {
      window.alert('That link was not inserted: only http(s), mailto, tel and site paths are allowed.');
      return;
    }
    body.focus();
    document.execCommand('createLink', false, href.trim());
    schedule();
  });

  document.querySelector<HTMLButtonElement>('[data-unlink]')?.addEventListener('click', () => {
    body.focus();
    document.execCommand('unlink', false);
    schedule();
  });

  /* ---------- images ---------- */

  const uploadFile = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append('csrf', (form.querySelector('[name="csrf"]') as HTMLInputElement).value);
    fd.append('file', file);
    say('Uploading ' + file.name + '…', 'ok');
    try {
      const r = await fetch('/api/admin/media/upload/', { method: 'POST', body: fd });
      const data = (await r.json()) as { url?: string; path?: string; error?: string };
      if (!r.ok || !data.path) {
        say(data.error || 'The upload failed.', 'error');
        return null;
      }
      say('Uploaded.', 'ok');
      return data.path;
    } catch {
      say('The upload failed — check the connection and try again.', 'error');
      return null;
    }
  };

  const publicUrl = (path: string) =>
    path.startsWith('/wp-content/uploads')
      ? 'https://img.vinylwraptoronto.com' + path.slice('/wp-content/uploads'.length)
      : path;

  // Insert into the body.
  const bodyPicker = document.createElement('input');
  bodyPicker.type = 'file';
  bodyPicker.accept = 'image/*';
  bodyPicker.hidden = true;
  document.body.appendChild(bodyPicker);

  document.querySelector<HTMLButtonElement>('[data-image]')?.addEventListener('click', () => {
    if (sourceMode) {
      say('Switch out of the HTML view to insert an image.', 'error');
      return;
    }
    body.focus();
    bodyPicker.click();
  });

  bodyPicker.addEventListener('change', async () => {
    const file = bodyPicker.files?.[0];
    bodyPicker.value = '';
    if (!file) return;
    const path = await uploadFile(file);
    if (!path) return;
    const alt = window.prompt('Describe this image (alt text — it counts for SEO and accessibility)') || '';
    const img = `<img src="${publicUrl(path)}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy" decoding="async" />`;
    body.focus();
    document.execCommand('insertHTML', false, img);
    schedule();
  });

  // The featured image.
  const featured = $<HTMLInputElement>('ed-featured');
  const featuredFile = $<HTMLInputElement>('ed-featured-file');
  const thumb = $<HTMLElement>('ed-thumb');
  $<HTMLButtonElement>('ed-featured-pick')?.addEventListener('click', () => featuredFile?.click());
  featuredFile?.addEventListener('change', async () => {
    const file = featuredFile.files?.[0];
    featuredFile.value = '';
    if (!file || !featured || !thumb) return;
    const path = await uploadFile(file);
    if (!path) return;
    featured.value = path;
    thumb.dataset.empty = 'no';
    thumb.innerHTML = `<img src="${publicUrl(path)}" alt="" />`;
    schedule();
  });
  $<HTMLButtonElement>('ed-featured-clear')?.addEventListener('click', () => {
    if (!featured || !thumb) return;
    featured.value = '';
    thumb.dataset.empty = 'yes';
    thumb.innerHTML = '';
  });

  /* ---------- slug ---------- */

  // Only follow the title while the slug has not been set by hand, and never
  // on a post that already has one — changing a published URL silently is how
  // you lose the rankings this whole panel exists to protect.
  let slugTouched = slugInput.value.length > 0;
  slugInput.addEventListener('input', () => { slugTouched = true; });
  titleInput.addEventListener('input', () => {
    if (!slugTouched) slugInput.value = slugify(titleInput.value);
    schedule();
  });

  /* ---------- tabs ---------- */

  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((t) => t.classList.remove('on'));
      tab.classList.add('on');
      document.querySelectorAll<HTMLElement>('.tab').forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
    });
  });

  /* ---------- brand chips ---------- */

  const brandInput = $<HTMLInputElement>('ed-brand-input');
  const chips = $<HTMLElement>('ed-chips');
  brandInput?.addEventListener('change', () => {
    const name = brandInput.value.trim();
    if (!name || !chips) return;
    const option = document.querySelector<HTMLOptionElement>(`#ed-brands option[value="${CSS.escape(name)}"]`);
    if (!option) return;
    const termId = option.dataset.id!;
    if (chips.querySelector(`input[value="${CSS.escape(termId)}"]`)) { brandInput.value = ''; return; }
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = name;
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = 'term';
    hidden.value = termId;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Remove ' + name);
    chip.append(hidden, remove);
    chips.appendChild(chip);
    brandInput.value = '';
  });
  chips?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (btn) btn.closest('.chip')?.remove();
  });

  /* ---------- live analysis ---------- */

  const scoreEl = $<HTMLElement>('ed-score')!;
  const checksEl = $<HTMLElement>('ed-checks')!;
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
      // textContent, not innerHTML: the label carries the author's own keyword.
      label.textContent = check.label;
      li.append(dot, label);
      checksEl.appendChild(li);
    }

    $<HTMLElement>('ed-words')!.textContent = String(report.stats.words);
    $<HTMLElement>('ed-read')!.textContent = String(report.stats.readingTimeMinutes);
    setCount('c-seotitle', report.stats.titleLength, 15, 60);
    setCount('c-metadesc', report.stats.descriptionLength, 70, 160);
  };

  const renderSerp = () => {
    const title = seoTitle.value || titleInput.value || 'Untitled';
    const desc = metaDesc.value || excerpt.value || 'No description yet.';
    $<HTMLElement>('serp-title')!.textContent = title.length > 60 ? title.slice(0, 59) + '…' : title;
    $<HTMLElement>('serp-desc')!.textContent = desc.length > 160 ? desc.slice(0, 159) + '…' : desc;
    $<HTMLElement>('serp-slug')!.textContent = slugInput.value || 'your-post';
  };

  const run = () => {
    renderSerp();
    render(
      analyse({
        title: titleInput.value,
        seoTitle: seoTitle.value || titleInput.value,
        description: metaDesc.value || excerpt.value,
        slug: slugInput.value,
        bodyHtml: currentHtml(),
        focusKeyword: focusInput.value,
      }),
    );
  };

  /* Debounced: the analysis is cheap but not free, and running it on every
     keystroke of a long post makes typing feel heavy. */
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 250);
  };

  for (const el of [body, htmlView, titleInput, slugInput, focusInput, seoTitle, metaDesc, excerpt]) {
    el.addEventListener('input', schedule);
  }
  run();

  /* ---------- saving ---------- */

  function say(message: string, kind: 'ok' | 'error') {
    flash.textContent = message;
    flash.className = 'alert alert--' + (kind === 'ok' ? 'ok' : 'error');
    flash.hidden = false;
  }

  let dirty = false;
  const markDirty = () => { dirty = true; };
  form.addEventListener('input', markDirty);

  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    syncOut();
    const data = new FormData(form);
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    say('Saving…', 'ok');
    try {
      const r = await fetch(form.action, { method: 'POST', body: data });
      const out = (await r.json()) as { id?: number; error?: string; score?: number; slug?: string };
      if (!r.ok || !out.id) {
        say(out.error || 'Could not save.', 'error');
        return;
      }
      dirty = false;
      if (!data.get('id')) {
        // A new post now has an id; move to its own address so a refresh does
        // not create a second copy of it.
        window.location.replace(`/admin/posts/${out.id}/?saved=1`);
        return;
      }
      say('Saved.', 'ok');
    } catch {
      say('Could not reach the server. Your text is still here — try again.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  });

  /* ---------- delete ---------- */

  $<HTMLButtonElement>('ed-delete')?.addEventListener('click', () => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    dirty = false;
    $<HTMLFormElement>('ed-delete-form')?.submit();
  });
}
