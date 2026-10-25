# Eywa (Avatar Pandora) — guide Claude Code

Codex Avatar/Pandora **cadeau pour Eva** (nièce de Sylvain, 18 ans, fan absolue d'Avatar). Le nom du site est **Eywa** (déesse-réseau de Pandora) — clin d'œil à Eva (E_W_A vs E_V_A, une lettre d'écart). Astro statique pur, déployé sur **Cloudflare Pages**.

## Architecture

| | |
|---|---|
| Stack | Astro 5/6 + îlots React 19 + @react-three/fiber + GSAP + Tailwind |
| Contenu | Markdown/MDX via Astro Content Collections |
| Backend | Aucun — le backend NestJS (qui ne servait plus que `/api/health` après le retrait du proxy images Fandom) est supprimé depuis le 01-10-2026 |
| Cible publique | Cloudflare Pages (`https://avatar-pandora-12q.pages.dev`) — 100 % statique, plus de Function |
| Hébergement | Cloudflare Pages uniquement. Jusqu'au 01-10-2026, une copie tournait sur le NAS (Docker/nginx) ; elle est supprimée (le NAS ne sert plus que de médias et sauvegardes) |

## Public + ton

- **Destinataire principal** : Eva. Dédicace en page À propos. **Toujours dire "Eva"**, jamais "ma sœur" / "une amie" / etc.
- **Ton** : sobre + 1 vanne en ouverture, lyrique mais pas pompeux, tutoiement direct.
- Voir `feedback_about_tone.md` et `feedback_cta_encouragement_tone.md` (mémoires user-level).

## Règle d'identité visuelle CENTRALE : atmosphère temps-driven, PAS scroll-driven

**Validée 2026-05-03 après pivot.** Sur la landing :

- ✅ **Boucle temporelle 75s** sur viewport unique. L'ambiance bouge autour du visiteur sans qu'il fasse rien.
- ✅ Cross-fade d'images Pandora (6 atmosphères : forêt, Hometree, montagnes flottantes, océan Metkayina, volcan Fire & Ash, reveal).
- ✅ `ParticleField` WebGL synchronisé sur la même clock 75s.
- ✅ Logo + tagline + CTAs centrés au-dessus, lisibles via dark vignette + text-shadow.
- ❌ **Pas de scrollytelling 700vh forcé** sur la `/` racine. La V1 l'avait, user a détesté ("je devais scroller pour voir le contenu actionnable").
- ✅ L'option scroll reste valide pour des **pages dédiées immersion** (ex `/cinema` en bonus). Mais jamais sur `/`.

Pattern technique réutilisable : `CinemaCanvas` mode `'time'` + `CycleBackdrop` qui cross-fade les images sur le même clock. Voir `frontend/src/components/cinema/`.

## Pas de ChatGPT — silence complet

**Important** : Eywa n'utilise **PAS** ChatGPT. Logo SVG codé custom, visuels = fonds et illustrations hébergés sur le site (le proxy wiki Fandom a été retiré le 01-10-2026).

❌ Ne pas mentionner ChatGPT dans la page About / README / commits — **même pour le nier**. Confirmé 2026-05-03 + reconfirmé 2026-05-06 : *"je ne l'ai pas utilisé, pas besoin d'en parler"*. Crédits = humain + Claude Code uniquement.

## Sources de contenu

1. **Pandorapedia** (officiel Disney/Cameron) — référence canon.
2. **Avatar Wiki Fandom** (https://avatar.fandom.com) — exhaustif, source de TEXTE. Plus aucune image n'en vient : le proxy `/api/wiki-image` est retiré (01-10-2026, défi anti-robot que Sylvain refuse de contourner ; pas de captures des films non plus). Fiche sans image hébergée → visuel par défaut `CoverFallback` (`src/lib/cover.ts`).
3. **Paul Frommer** — linguiste Na'vi, source pour la page Langue Na'vi.
4. **Synthèse Claude en français** pour les ~70 entrées lyriques du codex.

## Fair-use / publication publique

- ✅ Aucune image tierce affichée (proxy wiki retiré le 01-10-2026) ; illustrations propres hébergées sur le site à venir.
- ❌ Pas de re-host de stills films (Disney/Cameron).
- ✅ Repo public-ready (LICENSE MIT/CC). Auto-deploy Cloudflare Pages sur `git push origin main`.

## Codex (7 sections)

`Pandora` (8 entrées) · `Clans Na'vi` (7) · `Bestiaire` (14) · `Flore` (5) · `Personnages` (24) · `Films` (3) · `Engins` (8) · `Langue Na'vi` (standalone). ~70 entrées, 78 pages buildées.

Sidebar 320px sticky pattern warhammer (lore court, liens rapides, ressources externes).

## Workflow dev

Dev local : `cd frontend && source ~/.nvm/nvm.sh && nvm use 22 && npm run dev`. Cloudflare Pages construit et publie lui-même à chaque `git push origin main` (~2 min) ; la livraison se fait par `cadence deliver` (config dans `cadence.yaml`), qui vérifie que la page d'accueil porte le sha poussé.

## Tests

`cd frontend && npm run build` (81 pages) valide la cohérence (Content Collections + schéma Zod, types, intégrations Astro).
Puis `npm run test:scripts` (`node --test ../scripts/*.test.mjs`, Node ≥ 22.18 : les tests importent les
modules `.ts` tels quels — `export PATH=$HOME/.nvm/versions/node/v22.22.3/bin:$PATH`) : données des
Nouveautés et du Plan de travail, et tests navigateur sur le site **construit** (`frontend/dist`, lancer le
build avant) — pages Nouveautés et Plan de travail (dont l'absence de tout texte privé du plan dans `dist/`),
tiroir du téléphone (y compris après une navigation ClientRouter), contraste au pire pixel. Chromium via
`playwright-core` (devDependency) ; les tests navigateur passent en « skip » s'il manque.
`EYWA_E2E_SHOTS=<dossier>` enregistre des captures de /nouveautes/ à 1440, 390 et 320 px.

⚠ ClientRouter : un script `is:inline` identique sur toutes les pages ne s'exécute qu'au premier
chargement, alors que le DOM est remplacé à chaque navigation. Poser les écouteurs une seule fois
sur `document` et retrouver les éléments à chaque événement (cf. tiroir de CodexLayout, Lightbox).

## Pas de deadline

Qualité avant tout. Spec validée : `docs/superpowers/specs/2026-05-02-avatar-pandora-design.md`.

## Plan, sessions et revue UX (cadence)

Le reste à faire vit dans `.cadence/raf.yaml`, tenu par `raf`
([cadence](https://github.com/Sylad/cadence)) : chaque commit cite son lot dans le
message (`fix(L4): …`, `L2/t1`), `raf now` dit la suite, `raf check` repère les
écarts. Début et fin de session : skills `/cadence:session-start` et
`/cadence:session-close`.

**Porte de tests des vagues** (`orchestrate` de `cadence.yaml`, L38) : `build` = `cd frontend && npm run build`,
`test` = `cd frontend && npm run build && npm run test:scripts` (les tests navigateur lisent `frontend/dist`).
Il n'y a pas d'autre suite que le `node --test` des scripts. `precheck: true`.

**Revue UX obligatoire** (règle de Sylvain du 2026-09-28, tous les projets perso) : toute nouvelle
page ou modification d'écran est un lot `--visible`, revu par l'agent `cadence:ux-reviewer` (captures
1440 et 390 px, écarts fondés sur une règle nommée ou une mesure) avant `raf done`. Le verdict
s'enregistre avec `raf ux <lot> "…"`, sinon `raf done` refuse. Les lots « Revue UX — … » planifient
la revue de chaque écran existant ; les écarts trouvés deviennent des sous-tâches du lot.

**Nouveautés** (page `/nouveautes/`, L14, signature commune des apps) : les entrées vivent dans
`docs/nouveautes/*.md` (captures dans `docs/nouveautes/captures/`, jamais plus de 6× plus larges que
hautes ; guillemets « » tenus par une espace fine insécable U+202F). Après tout ajout ou modification
d'une entrée, lancer `cd frontend && npm run news` (= `cadence news build` vers
`frontend/public/nouveautes-data/`) et **commiter le résultat** : Cloudflare Pages construit sans
cadence, la page lit ce JSON au build. `npm run test:scripts` échoue si le JSON versionné n'est plus à jour.
Lien permanent `/nouveautes/#<slug>` par entrée : bouton visible « Copier le lien » dans la ligne de date
(le titre est du texte ; copier ne fait ni défiler ni changer l'adresse, retour dans le libellé à largeur
réservée ; `src/lib/news-anchor.ts` + script de `nouveautes.astro`) ; arrivée sur l'ancre = entrée signalée
et focalisée, sous le bouton menu. Pastille « non vues » sur TOUS les liens Nouveautés (un seul composant
`components/NewsBadge.astro` : menu, tiroir, accueil), nombre dans le nom du bouton menu au téléphone,
bandeau « N nouveautés depuis ta dernière visite », marque « Nouveau » et séparateur « Déjà vu lors de ta
visite du … » — HORS des listes (`role="separator"` nommé entre deux `<ol>`, WCAG 1.3.1), seulement si toutes
les nouvelles sont au-dessus. Un seul script dans `BaseLayout.astro` (index léger `#eywa-news-index`,
rejoué à chaque `astro:page-load`), logique pure `src/lib/news-seen.ts` : localStorage `eywa.news.seen-v1`
= tous les slugs vus (`all: true`) ; mémoire de base posée dès la première page vue ; l'ancien format de
L14 (sans `all`, déjà chez des visiteurs) reste lu — ne jamais changer la clé ni casser ce format.

**Navigation** (consigne de Sylvain) : Nouveautés ET Plan de travail sont proposés partout où le site a une
navigation — barre latérale / tiroir du codex (Plan de travail juste après Nouveautés) et accueil (seconde
rangée « Suivre le codex » sous les deux boutons, deux liens côte à côte jusqu'à 320 px, jamais seuls sur
leur ligne). Contrôlé par `scripts/navigation.e2e.test.mjs` : accueil sans défilement à 1440×900,
1366×768 et jusqu'à 320×568 ; les 12 liens de la barre latérale visibles à 1280×720 (marges resserrées
sous 820 px de haut). La page À propos, sans menu, porte la même rangée avec un « ← Accueil » en tête
(`components/FollowLinks.astro`, partagé par l'accueil et À propos). Au téléphone, le bouton de pause de
l'ambiance est en haut à droite de l'accueil (en bas, il recouvrait « Plan de travail » à 320×568) ; un
texte agrandi (×1,25, espacement WCAG 1.4.12) fait passer un libellé à la ligne dans son lien, jamais
déborder la rangée.

**Plan de travail** (page `/plan-de-travail/`, L20, modèle evatosorus/finance-tracker) : en cours, prévu,
récemment livré, rendue **au build** depuis `.cadence/raf.yaml` (`src/lib/plan-public.ts`, lu depuis
`frontend/` : `../.cadence/raf.yaml`, vrai aussi sur Cloudflare Pages dont la commande est
`cd frontend && …`). `raf.yaml` absent ou sans `lots` = build en échec. Ne sont publiés que les lots
`visible: true`, non abandonnés, qui ont un **titre public** : champ `public:` du lot, sinon titre de la
Nouveauté la plus récente qui le cite ; les lots « Revue … » exigent un `public:` ; sinon masqués. Liste
blanche : id (en `data-id` seulement), titre public, état, date de livraison, étapes faites/total
(abandonnées exclues). Jamais notes, verdicts UX, raisons, titres bruts ni titres d'étapes —
`scripts/plan-page.e2e.test.mjs` le vérifie sur tout `dist/`. Un `public:` non conforme (> 80 caractères,
« / », fichier, identifiant de lot, nom de technique, sujet de sécurité) fait échouer le build : écrire
`public:` en français pour le lecteur. Dates par le formateur unique `src/lib/format-date.mjs`
(« 1er octobre 2026 »), rendues dans les pages par `components/FrDate.astro` (ordinal en exposant, qui
garde sa casse dans les lignes en capitales). En-tête commun aux deux pages méta : `components/MetaHeader.astro`.
