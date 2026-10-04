# TIMAN TUTORIAL V4.6 — replacement and motion verification

The replacement browser capture was made at a 2048×1600 CSS-pixel viewport. Its width and horizontal layout match the validated V4 source. The extra height makes all six machine cards and “Gå til Leveringsdato” visible at once. The browser reported `scrollY=0` on every one of the 48 captured frames; the document height equaled the viewport height. The real button click reached Trin 2. The live cart had one Timan 3330 and no RC-751 or quantity discount before the click.

The 1.600-second browser recording is `../machine-transition-source-v4-6.mp4` (1920×1500, 30 fps). The matching splice is `../machine-transition-splice-v4-6.mp4` (1920×1500, 30 fps). Its upper 1080-pixel area holds the last validated V4 machine frame steady; its lower machine cards and button come from the taller real browser capture. The upper cursor is patched with a clean Portal control, and the matching cursor path leads to the button. The click was validated in the browser capture; the cut to Trin 2 uses the validated V4 frame. The 48-frame replacement occupies source frames 481–528. For visual continuity, only the static lower machine area is extended beneath the original source from frame 146, the first Trin 1 frame after Portal navigation, through frame 480. The original upper Portal, clicks, cart and pacing remain unchanged. The retimed source remains 3006 frames and 100.2 seconds.

The HyperFrames composition has one global Portal transform for all steps: `x=-650.4186046511628`, `y=100`, `scale=1.2465116279069768`. Crop: X=525, Y=0, width=860. The added source height is visible only during machine selection; the rest of the source is padded with the existing background. There are zero animated X, Y and scale camera keyframes. The V4.3 pacing holds, chapters, captions and final callout remain unchanged.

Entry continuity: source frame 145 is the last pre-Configurator frame; frame 146 is the first Trin 1 frame and already includes the lower cards. At the 48-frame splice, frame 480→481 differs by only 0.016 mean pixel levels in the lower machine area and 0.913 in the fixed header (the latter includes video re-encoding). This avoids a new pop at 00:15.

Safety: final send clicked NO; order submitted NO; email sent NO; Portal source changed NO; Supabase changed NO; migration applied NO.

## Visual checkpoints

| Check | Result |
| --- | --- |
| 3330 quantity 1 and RC-751 removed before navigation | PASS |
| Quantity discount removed before delivery | PASS |
| Whole-page browser scroll during replacement | 0 pixels — PASS |
| Loader-Line, Løs redskab, delivery button and cart visible together | PASS |
| HyperFrames X/Y/scale animations | 0/0/0 — PASS |
| Fixed top guide and approved timing | PASS |
| Splice contact sheet | `snapshots-final-splice/contact-sheet.jpg` |

## Final render

`../timan-configurator-tutorial-mobile-v4-6.mp4` is 98.766667 seconds, 1080×1920, 30 fps, H.264/yuv420p, 2963 frames. All frames decoded without FFmpeg error. Ninety-nine one-second samples across the complete tutorial were inspected in `second-by-second/contact-1.jpg` through `contact-4.jpg`. The first Trin 1 frame, both sides of the source splice, and the final send-action frame were inspected at higher resolution. Outside the machine section, rendered V4.6 frames at 35, 55 and 96 seconds differ from V4.5 by less than 0.65 mean pixel levels (encoding variation).

| Final visual check | Result |
| --- | --- |
| Animated outer-camera X / Y / scale | 0 / 0 / 0 — PASS |
| Whole-page machine-selection scroll | 0 — PASS |
| Confusing 00:15–00:17 vertical jump | Removed — PASS |
| Visible frame-wide flash, scale jump or content-position jump at splice | None observed — PASS |
| 3330 and RC-751 sequence, discount and removal | PASS |
| Lower cards and delivery button in fixed frame | PASS |
| Delivery and configuration outer frame | PASS |
| Equipment panel scroll only, 720599 → 730020 pacing preserved | PASS |
| Customer and order-confirmation frame | PASS |
| Final send clicked / order submitted / email sent | NO / NO / NO |

READY AS FINAL TUTORIAL: YES.
