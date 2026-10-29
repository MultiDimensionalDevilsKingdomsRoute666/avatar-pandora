// L42 — espacement du corps des fiches. Lit frontend/dist ; skip sans playwright-core/Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIST, setupBrowser } from './lib/e2e-dist.mjs';

const SECTIONS = ['pandora', 'clans', 'bestiaire', 'flore', 'personnages', 'films', 'engins'];

function fiches() {
  const out = [];
  for (const s of SECTIONS) {
    for (const d of readdirSync(join(DIST, s), { withFileTypes: true })) {
      if (d.isDirectory() && existsSync(join(DIST, s, d.name, 'index.html'))) out.push(`/${s}/${d.name}/`);
    }
  }
  return out;
}

test('R1 — toutes les fiches : chaque paragraphe du corps garde une marge basse d\'au moins 0,75 em (mur de texte à 390 px)', { timeout: 300_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const page = await env.browser.newPage({ viewport: { width: 390, height: 800 } });
  const urls = fiches();
  assert.ok(urls.length >= 60, `fiches trouvées : ${urls.length}`);
  for (const url of urls) {
    await page.goto(`${env.base}${url}`, { waitUntil: 'load' });
    const ps = await page.evaluate(() =>
      [...document.querySelectorAll('article .entry-body > p')].map((p) => {
        const cs = getComputedStyle(p);
        return parseFloat(cs.marginBottom) / parseFloat(cs.fontSize);
      }));
    assert.ok(ps.length > 0, `${url} : aucun paragraphe dans .entry-body`);
    for (const em of ps) assert.ok(em >= 0.75, `${url} : marge basse ${em.toFixed(2)} em`);
  }
});

for (const width of [1440, 390]) {
  test(`R2 — fiche Flore Hometree @${width}px : deux paragraphes voisins sont séparés par un vide mesuré d'au moins une demi-ligne`, { timeout: 60_000 }, async (t) => {
    const env = await setupBrowser(t);
    if (!env) return;
    const page = await env.browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${env.base}/flore/hometree/`, { waitUntil: 'load' });
    const gaps = await page.evaluate(() => {
      const ps = [...document.querySelectorAll('article .entry-body > p')];
      return ps.slice(1).map((p, i) => ({
        gap: p.getBoundingClientRect().top - ps[i].getBoundingClientRect().bottom,
        line: parseFloat(getComputedStyle(p).lineHeight),
      }));
    });
    assert.ok(gaps.length >= 1, 'moins de deux paragraphes voisins');
    for (const { gap, line } of gaps) assert.ok(gap >= line / 2, `vide ${Math.round(gap)} px pour une ligne de ${Math.round(line)} px`);
  });
}
