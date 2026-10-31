// L28 — WCAG 2.2.2 : l'ambiance animée (particules, fonds, pulsations) doit pouvoir être mise
// en pause sur l'accueil ET sur les pages du codex ; une fois en pause, plus aucun mouvement
// pendant 3 s (images identiques, aucune animation CSS en cours). Lit frontend/dist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBrowser } from './lib/e2e-dist.mjs';

const PAGES = ['/', '/clans/', '/clans/omatikaya/'];
const KEY = 'eywa-atmosphere-paused';

async function frame(page) {
  return (await page.screenshot({ animations: 'allow' })).toString('base64');
}

// Sous charge, un dernier rendu (particules, lissage du pointeur) peut tomber bien après le clic :
// plutôt qu'un délai fixe, on attend deux images consécutives identiques (10 s au plus) avant de
// mesurer l'immobilité. L'échec d'une pause réelle, lui, reste vu : l'image continue de changer.
async function waitStill(page, ms = 10_000) {
  const end = Date.now() + ms;
  let prev = await frame(page);
  while (Date.now() < end) {
    await page.waitForTimeout(300);
    const cur = await frame(page);
    if (cur === prev) return true;
    prev = cur;
  }
  return false;
}

// Témoin : l'ambiance bouge (jusqu'à 5 images comparées, une machine chargée peut en rendre deux égales).
async function moves(page) {
  let prev = await frame(page);
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(600);
    const cur = await frame(page);
    if (cur !== prev) return true;
    prev = cur;
  }
  return false;
}

async function runningAnimations(page) {
  return page.evaluate(() =>
    document.getAnimations()
      .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity || (a.playState === 'running' && a.effect?.getComputedTiming().activeDuration > 1000))
      .map((a) => a.animationName ?? a.constructor.name));
}

for (const path of PAGES) {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    test(`${path} @${width}px : bouton de pause présent, ambiance immobile 3 s après un clic`, { timeout: 90_000 }, async (t) => {
      const env = await setupBrowser(t);
      if (!env) return;
      const context = await env.browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await page.goto(`${env.base}${path}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1500);

      const btn = page.locator('#eywa-atmo-toggle');
      assert.equal(await btn.count(), 1, 'un bouton de pause #eywa-atmo-toggle');
      assert.equal(await btn.getAttribute('aria-pressed'), 'false');
      const label = await btn.getAttribute('aria-label');
      assert.match(label, /pause/i);

      // Témoin : sans pause, l'ambiance bouge (sinon la mesure ne prouve rien).
      assert.equal(await moves(page), true, 'témoin : l’ambiance doit bouger avant la pause');

      // Le bouton n'est recouvert par rien : un vrai clic l'atteint.
      await btn.click();
      assert.equal(await btn.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('eywa-atmo-paused')), true);
      await page.mouse.move(width / 2, height / 2); // le pointeur ne doit pas relancer les particules
      await page.mouse.move(width / 2 + 3, height / 2 + 3);
      assert.equal(await waitStill(page), true, `${path} @${width}px : l’image ne s’est pas figée après le clic`);

      const frames = [];
      for (let i = 0; i < 4; i++) {
        frames.push(await frame(page));
        await page.waitForTimeout(1000);
      }
      assert.equal(new Set(frames).size, 1, `${path} @${width}px : l’image a changé pendant 3 s de pause`);
      assert.deepEqual(await runningAnimations(page), [], 'animations CSS encore en cours');

      // Mémorisé : une navigation complète garde la pause.
      assert.equal(await page.evaluate((k) => localStorage.getItem(k), KEY), 'true');
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(1200);
      assert.equal(await page.locator('#eywa-atmo-toggle').getAttribute('aria-pressed'), 'true');
      assert.equal(await waitStill(page), true, 'rechargé en pause : l’image ne se fige pas');
      const r1 = await frame(page);
      await page.waitForTimeout(1500);
      assert.equal(await frame(page), r1, 'rechargé en pause : l’image bouge');

      // Reprise.
      await page.locator('#eywa-atmo-toggle').click();
      assert.equal(await page.locator('#eywa-atmo-toggle').getAttribute('aria-pressed'), 'false');
      assert.equal(await moves(page), true, 'reprise : l’ambiance doit repartir');
      await context.close();
    });
  }
}

test('mouvement réduit : pas de bouton de pause, rien à arrêter (codex)', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const context = await env.browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${env.base}/clans/`, { waitUntil: 'load' });
  assert.equal(await page.locator('#eywa-atmo-toggle').isVisible(), false);
  assert.equal(await page.locator('canvas').count(), 0);
  await context.close();
});

test('codex 320/390/1440 px : le bouton de pause ne recouvre ni le menu ni un autre contrôle fixe', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  for (const [width, height] of [[320, 568], [390, 844], [1440, 900]]) {
    const context = await env.browser.newContext({ viewport: { width, height }, hasTouch: width < 500 });
    const page = await context.newPage();
    await page.goto(`${env.base}/clans/`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const hit = await page.evaluate(() => {
      const r = document.getElementById('eywa-atmo-toggle').getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
      // Contrôles fixes seulement : le contenu défile sous un bouton flottant (comme celui de l'audio).
      const fixed = (e) => { for (let n = e; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false; };
      const others = [...document.querySelectorAll('a[href], button')].filter(fixed).filter((e) => e.id !== 'eywa-atmo-toggle' && e.id !== 'eywa-ambient-toggle').filter((e) => {
        const b = e.getBoundingClientRect(), s = getComputedStyle(e);
        return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0
          && Math.min(b.right, r.right) - Math.max(b.left, r.left) > 0 && Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 0;
      }).map((e) => e.id || e.getAttribute('href'));
      return { onTop: top?.closest('#eywa-atmo-toggle') !== null, others, box };
    });
    assert.equal(hit.onTop, true, `${width}px : bouton recouvert`);
    assert.deepEqual(hit.others, [], `${width}px : chevauche ${hit.others}`);
    assert.ok(hit.box.w >= 24 && hit.box.h >= 24, `${width}px : cible < 24 px (WCAG 2.5.8)`);
    await context.close();
  }
});
