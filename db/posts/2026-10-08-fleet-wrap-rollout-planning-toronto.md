# Fleet rollout article review

This article uses the existing Astro blog-card and post templates. Its source of truth is D1 post 497, currently **draft**, with no publication timestamp. Review it while signed in at https://astro.vinylwraptoronto.com/admin/posts/497/preview/.

- Title: Fleet Wrap Rollout Planning in Toronto: A Practical Guide
- Slug: `fleet-wrap-rollout-planning-toronto`
- Primary keyword: fleet wrap rollout planning
- Related phrases: fleet wrap installation schedule; phased fleet wrapping; fleet branding rollout
- Audience: Toronto and GTA commercial fleet operators arranging initial installations across working vehicles
- Search intent: practical commercial planning leading to a scoped inquiry
- Length: 1,251 words, including the illustration disclosure and table
- SEO title: Fleet Wrap Rollout Planning in Toronto | Practical Guide
- Meta description: Fleet wrap rollout planning in Toronto: organise vehicle records, artwork approvals, pilot reviews and installation batches around your working schedule.
- Intended served article: https://astro.vinylwraptoronto.com/fleet-wrap-rollout-planning-toronto/
- Canonical: the existing template retains the primary domain, as required by the repository's SEO checks. Astro is currently the preview deployment; this work does not publish the article on the primary WordPress site or change that routing.

## Research and content gap

Fresh public search and live D1 inventory informed the topic. Exact search volume, keyword difficulty, rankings and Search Console performance were unavailable. The provisional editorial opportunity score is 76/100: intent 90/100 at 30%, relevance 100 at 25%, opportunity 55 at 20%, demand evidence 35 at 15%, gap 80 at 10%. These are judgments, not tool-provided metrics.

The existing fleet checklist, colour matching, and replacement-schedule articles address adjacent decisions. This article instead connects the initial vehicle register, artwork approval owner, pilot review, operational batch capacity, surface readiness and handover responsibilities.

Competitor service pages cover fleet benefits, design and installation broadly. The useful gap is a practical sequence for coordinating different vehicles while the business keeps operating:

- https://torontosigninstallers.com/services/vehicle-wraps/fleet-graphics
- https://wrapconceptz.com/fleet-wraps-gta
- https://marvelcarclinic.ca/commercial-wrap.html

Vehicle-specific inspection guidance is supported by [3M vehicle application guidance](https://multimedia.3m.com/mws/media/2419563O/application-vehicles-ra-pdf.pdf). No pricing, installation duration, guarantees or completed customer projects were invented.

## Assets and links

Two original AI illustrations were uploaded through the existing authenticated admin uploader and verified on the Cloudflare image hostname. Both are WebP, 1500 × 788, and visibly identified as illustrations. Offline copies follow the existing `public/wp-content/uploads` fallback; production references the image hostname.

- Featured: https://img.vinylwraptoronto.com/2026/10/fleet-wrap-rollout-toronto-d7faac.webp (183,086 bytes)
- Supporting: https://img.vinylwraptoronto.com/2026/10/fleet-wrap-pilot-colour-review-179025.webp (76,228 bytes)
- One selectable semantic HTML comparison table, with a caption, column and row headers, and responsive horizontal scrolling
- Four internal links: vehicle photography guide, commercial vehicle wraps, contact, and fleet replacement planning, all on the requested Astro hostname

## Validation and publication gate

The content source, metadata and generated SQL are committed together. The SQL is idempotent and inserts this article as a draft. The authoring script now supports explicit draft status, post-scoped styles and known featured-image dimensions. Existing specifications retain their published default and canonical policy.

The published snapshots were reconciled using `scripts/pull-posts.mjs`: all 496 already-published D1 posts are preserved, including 17 missing from the previously committed 479-post snapshot. The draft is deliberately excluded. No unrelated post was rewritten in D1.

`npm ci`, `npm run build`, `node scripts/sweep.mjs`, Astro diagnostics, the authoring regression test, and focused browser checks form the validation set. The focused preview builds from the actual D1 draft using existing templates, temporarily overlays local inputs, then restores the faithful published snapshots. Mobile checks cover 320, 390, 768 and 1440 pixels, working card navigation, loaded images, one H1, metadata and the contained table.

**Human approval is required before publication.** After approval, promote this existing D1 draft with the established editor, regenerate its metadata and the committed snapshots, validate the publication diff, then merge through the existing Deploy workflow. Verify the public article and blog listing on `astro.vinylwraptoronto.com` after the workflow succeeds. Do not change DNS or route the primary WordPress domain. Merging this draft-only state alone does not make the article public.

Run the offline generator regression check with Node 22.5 or newer:

```sh
node scripts/test-new-post.mjs
```
