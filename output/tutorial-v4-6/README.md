# Timan Konfigurator – godkendt V4.6

**Slutvideo:** `timan-configurator-tutorial-mobile-v4-6.mp4` · 1080 × 1920 · 30 fps · H.264/yuv420p · 98,766667 sekunder (ca. 98,8 sekunder). Den godkendte MP4 og råmaterialet opbevares lokalt i `output/`; de lægges ikke i Git, da optagelsen kan vise kundeoplysninger. Ældre, bevidst gemte V4–V4.5-versioner bevares.

## Kilder og metode

- Den validerede V4-brugerrejse blev optaget i Portal med Playwright i en Edge-profil. `output/tutorial-v4/raw/` indeholder den oprindelige optagelse og hændelser; `output/tutorial-v4/configuration-gate/` dokumenterer udstyrskontrollen. Playwright udfører klik og kontrollerer tilstand; FFmpeg optager/skalerer billedstrømmen, indføjer de godkendte pauser og samler kildevideoen. Se V4-scripts og `output/tutorial-v4-3/v4-retimed-holds.mp4`.
- V4.6 genoptager kun maskinvalgets overgang med `record-machine-transition.mjs`: 48 reelle browserbilleder ved 2048 × 1600 uden scroll af hele siden. `machine-transition-source-v4-6.mp4` er den korte råvideo. `build-replacement-frames.py` bruger de gemte referencebilleder (`join-before.png`, `step2-matched.png`, `tall-machine-probe.png`) til den visuelle overgang. `machine-transition-splice-v4-6.mp4` og `lower-machine-extension.png` er de gemte indlægsfiler. De erstatter kildeframe 481–528; den statiske nedre maskindel forlænges ved frame 146–480. Den færdige kilde er `v4-6-spliced-source.mp4` (1920 × 1500, 30 fps, 100,2 sekunder).
- `build-hyperframes-v4-6.mjs` opbygger HyperFrames-projektet i `hyperframes-mobile/` ud fra den gemte kilde og V4-hændelser. HyperFrames v0.8.115 laver den lodrette ramme, trinviseren, billedtekster og fremhævelser og renderer MP4. Det ændrer ikke Portalens handlinger.

**Fast ydre Portal-kamera:** HyperFrames har én fast placering. Animeret X = 0, animeret Y = 0 og animeret scale = 0. Den godkendte beskæring er X = 525, Y = 0, bredde = 860 i kilden. Kun reel scroll *inde i Portalens egne felter* må skabe bevægelse. Scroll af hele Portal-siden bruges ikke i den nye maskinovergang. Se `qa/verification-v4-6.md`.

Tutorialen viser knappen **“Afsend ordre”**, men klikker den ikke. Der oprettes eller sendes ingen testordre.

## Genskab eller opdater senere

1. Åbn projektmappen i **Codex/PowerShell**. Bevar først en kopi af den godkendte MP4. Kontrollér V4-optagelsens og udstyrskontrollens PASS-resultater, og brug den gemte `v4-6-spliced-source.mp4`, hvis kun tekst eller komposition skal opdateres. Ændr ikke den godkendte komposition ved en ren arkivgendannelse.
2. Skal maskinovergangen optages igen, brug en **lokal, allerede logget ind Edge-profil** uden for Git. Sæt om nødvendigt `TIMAN_TUTORIAL_PROFILE` og `TIMAN_EDGE_PATH` i PowerShell. Kør `node output/tutorial-v4-6/probe-tall-machine.mjs` og derefter `node output/tutorial-v4-6/record-machine-transition.mjs` fra projektets rod. Kontrollér `replacement-audit.json`: 3330 = 1, RC-751 fjernet, ingen mængderabat, scrollY = 0, Trin 2 nået. Scripts spærrer ordre- og andre skrivekald; afsend aldrig testordren.
3. Kun ved ny kilde: genskab referencebillederne fra de tilsvarende frames i den validerede V4.3-kilde, kør `python output/tutorial-v4-6/build-replacement-frames.py`, og brug FFmpeg ved 30 fps til at samle `replacement-composite-frames/frame-%03d.png` til `machine-transition-splice-v4-6.mp4`. Indsæt de 48 frames ved kildeframe 481–528, behold øvrige V4.3-frames og forlæng kun den nedre maskindel ved frame 146–480. Kontrollér overgangene og bevar præcis 3006 frames/100,2 sekunder i `v4-6-spliced-source.mp4` før render. Den allerede gemte kildevideo er den eksakte reproducerbare indgang til godkendt V4.6.
4. Kør `node output/tutorial-v4-6/build-hyperframes-v4-6.mjs` fra roden. Åbn `output/tutorial-v4-6/hyperframes-mobile/` og kør `npm run check` og `npm run render` (HyperFrames v0.8.115). Eksportér 1080 × 1920 ved 30 fps som H.264/yuv420p. Sammenlign med den godkendte MP4, kontrollér alle frames for dekodningsfejl og gennemgå hele brugerrejsen visuelt, før en ny version godkendes.

Git indeholder kun opskrift og scripts. MP4, skærmbilleder, råoptagelser, lokal browserprofil og enhver auth-/sessionsfil forbliver lokalt. `qa/verification-v4-6.md` indeholder resultatet af den afsluttede visuelle kontrol.
