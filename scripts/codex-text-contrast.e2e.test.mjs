// L27 — WCAG 1.4.3 : texte du codex posé sur les particules WebGL, mesuré au PIRE PIXEL
// sous les glyphes (fiche : paragraphes de l'article ; cartes : résumés), à 1440 et 390 px,
// particules figées sur trois images différentes. Lit frontend/dist ; skip sans Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBrowser, worstPixelContrast } from './lib/e2e-dist.mjs';

const CASES = [
  { path: '/clans/', sel: '.entry-card__summary', label: 'résumé de carte' },
  { path: '/clans/omatikaya/', sel: 'article .font-body p', label: 'paragraphe de fiche' },
];

test('texte du codex (fiche, résumés de cartes) ≥ 4,5:1 au pire pixel du fond (1440/390 px)', { timeout: 360_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const report = [];
  const failures = [];
  for (const { path, sel, label } of CASES) for (const width of [1440, 390]) {
    const context = await env.browser.newContext({ viewport: { width, height: width > 1000 ? 900 : 844 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    for (const frame of [1, 2, 3]) {
      await page.goto(`${env.base}${path}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800 + 700 * frame);
      await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
      const el = page.locator(sel).first();
      await el.scrollIntoViewIfNeeded();
      const box = await el.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(150);
      const { worst, glyphs } = await worstPixelContrast(page, sel);
      const where = `${path} ${label} @${width}px image ${frame}`;
      report.push(`${where} : ${worst.toFixed(2)}:1 (${glyphs} px)`);
      assert.ok(glyphs > 20, `${where} : glyphes non détectés`);
      if (worst < 4.5) failures.push(`${where} : ${worst.toFixed(2)}:1`);
    }
    await context.close();
  }
  for (const line of report) t.diagnostic(line);
  assert.deepEqual(failures, []);
});
