// L26 — WCAG 1.4.10 : le bandeau de section (SectionHero) ne rogne plus son texte au
// téléphone. À toute largeur la hauteur suit le contenu ; le texte reste dans le bandeau.
// Lit frontend/dist ; skip sans playwright-core/Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBrowser } from './lib/e2e-dist.mjs';

const PAGES = ['/personnages/', '/bestiaire/', '/clans/', '/pandora/', '/flore/', '/films/', '/engins/'];

test('bandeau de section : aucun texte rogné de 320 à 1440 px, ratio 16:10 (21:9 dès 768 px) quand le texte tient', { timeout: 240_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const failures = [];
  for (const width of [320, 360, 390, 767, 768, 800, 900, 1000, 1280, 1440]) {
    const context = await env.browser.newContext({ viewport: { width, height: 700 } });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(`${env.base}${path}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const m = await page.evaluate(() => {
        const hero = document.querySelector('.section-hero');
        const h = hero.getBoundingClientRect();
        const cut = [];
        for (const el of hero.querySelectorAll('.section-hero__roman, .section-hero__title, .section-hero__tagline')) {
          const r = el.getBoundingClientRect();
          if (r.top < h.top - 0.5 || r.bottom > h.bottom + 0.5) cut.push(`${el.className} déborde de ${Math.round(Math.max(h.top - r.top, r.bottom - h.bottom))} px`);
        }
        return { cut, ratio: h.width / h.height };
      });
      if (m.cut.length) failures.push(`${path} @${width}px : ${m.cut.join(', ')}`);
      // Jamais plus plat que 16:10 (21:9 dès 768 px).
      const max = (width >= 768 ? 21 / 9 : 1.6) + 0.02;
      if (m.ratio > max) failures.push(`${path} @${width}px : ratio ${m.ratio.toFixed(2)} > ${max.toFixed(2)}`);
    }
    await context.close();
  }
  assert.deepEqual(failures, []);
});
