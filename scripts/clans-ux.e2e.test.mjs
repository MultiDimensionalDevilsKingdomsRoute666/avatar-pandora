// L8 — revue UX de Clans (liste + fiche). Lit frontend/dist ; skip sans playwright-core/Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBrowser } from './lib/e2e-dist.mjs';

test('R1 — liste Clans : les titres de cartes sont des h2 sous le h1, sans saut de niveau (WCAG 1.3.1)', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const page = await env.browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${env.base}/clans/`, { waitUntil: 'load' });
  const levels = await page.evaluate(() =>
    [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1])));
  assert.equal(levels[0], 1);
  assert.equal(levels.length, 1 + await page.locator('.entry-card').count(), `titres trouvés : ${levels.length}`);
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i] <= levels[i - 1] + 1, `saut de h${levels[i - 1]} à h${levels[i]} (rang ${i})`);
  }
  assert.equal(await page.locator('.entry-card h2.entry-card__title').count(), await page.locator('.entry-card').count());
});

for (const width of [1440, 390]) {
  test(`R2 — fiche Clans @${width}px : le retour dit où il mène et se touche (≥ 44×44 px, WCAG 2.4.4 / 2.5.5)`, { timeout: 60_000 }, async (t) => {
    const env = await setupBrowser(t);
    if (!env) return;
    const page = await env.browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${env.base}/clans/anurai/`, { waitUntil: 'load' });
    const back = page.getByRole('link', { name: /Tous les clans/ });
    assert.equal(await back.count(), 1);
    assert.equal(await back.getAttribute('href'), '/clans/');
    const box = await back.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `cible ${Math.round(box.width)}×${Math.round(box.height)} px`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'débordement horizontal');
  });
}

test('R3 — fiche Clans : le bloc de retour est un repère nommé, distinct de la navigation du codex (WCAG 1.3.1 / ARIA11)', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const page = await env.browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${env.base}/clans/anurai/`, { waitUntil: 'load' });
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('main nav, article nav')].filter((n) => !n.getAttribute('aria-label')).length);
  assert.equal(unnamed, 0, 'nav sans nom dans la fiche');
});

// Au téléphone, menu et pause sont fixes : sans bande pleine derrière eux, ils recouvraient une
// ligne de texte à 68 positions de défilement sur 82 sur Films (mesure de la revue UX L6, 390×844 ; bande posée par le gabarit commun).
for (const path of ['/clans/anurai/', '/clans/']) {
  test(`R4 — ${path} @390px : au défilement, menu et pause ne recouvrent aucune ligne de texte (bande pleine derrière eux)`, { timeout: 90_000 }, async (t) => {
    const env = await setupBrowser(t);
    if (!env) return;
    const context = await env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    await page.goto(`${env.base}${path}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    assert.ok(total > 800, `page trop courte pour défiler (${total} px)`);
    const bad = [];
    for (let y = 0; y <= total; y += 40) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      const found = await page.evaluate(() => {
        const rect = (e) => e?.getBoundingClientRect();
        const bar = rect(document.querySelector('.eywa-topbar'));
        const barAlpha = (() => {
          const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(document.querySelector('.eywa-topbar') ?? document.body).backgroundColor);
          const p = m ? m[1].split(',').map(Number) : [];
          return p.length === 4 ? p[3] : 1;
        })();
        const buttons = ['eywa-burger', 'eywa-atmo-toggle'].map((id) => [id, rect(document.getElementById(id))]);
        const hits = [];
        const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of range.getClientRects()) {
            if (r.width < 1 || r.height < 1) continue;
            for (const [id, b] of buttons) {
              const over = Math.min(r.right, b.right) - Math.max(r.left, b.left) > 0
                && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 0;
              const hidden = bar && barAlpha >= 0.9 && b.top >= bar.top && b.bottom <= bar.bottom
                && b.left >= bar.left && b.right <= bar.right;
              if (over && !hidden) hits.push(`${id} sur « ${n.textContent.trim().slice(0, 30)} »`);
            }
          }
        }
        return hits;
      });
      if (found.length) bad.push(`${y}px : ${found[0]}`);
    }
    assert.deepEqual(bad, [], `${bad.length} positions avec recouvrement, ex. ${bad[0]}`);
    await context.close();
  });
}
