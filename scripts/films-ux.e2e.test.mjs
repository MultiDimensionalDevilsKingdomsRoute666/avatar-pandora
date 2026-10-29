// L6 — revue UX de Films (liste + fiche). Lit frontend/dist ; skip sans playwright-core/Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBrowser } from './lib/e2e-dist.mjs';

test('R1 — liste Films : les titres de cartes sont des h2 sous le h1, sans saut de niveau (WCAG 1.3.1)', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const page = await env.browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${env.base}/films/`, { waitUntil: 'load' });
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
  test(`R2 — fiche Films @${width}px : le retour dit où il mène et se touche (≥ 44×44 px, WCAG 2.4.4 / 2.5.5)`, { timeout: 60_000 }, async (t) => {
    const env = await setupBrowser(t);
    if (!env) return;
    const page = await env.browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${env.base}/films/avatar-2009/`, { waitUntil: 'load' });
    const back = page.getByRole('link', { name: /Tous les films/ });
    assert.equal(await back.count(), 1);
    assert.equal(await back.getAttribute('href'), '/films/');
    const box = await back.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `cible ${Math.round(box.width)}×${Math.round(box.height)} px`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'débordement horizontal');
  });
}

test('R3 — fiche Films : le bloc de retour est un repère nommé, distinct de la navigation du codex (WCAG 1.3.1 / ARIA11)', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const page = await env.browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${env.base}/films/avatar-2009/`, { waitUntil: 'load' });
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('main nav, article nav')].filter((n) => !n.getAttribute('aria-label')).length);
  assert.equal(unnamed, 0, 'nav sans nom dans la fiche');
});
