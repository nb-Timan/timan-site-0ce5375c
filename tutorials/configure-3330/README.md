# Timan 3330 tutorials

This folder is isolated from the Timan Portal application. It contains the
browser recordings and HyperFrames project used for the Timan 3330 tutorials.

The V2 Playwright flow configures a Timan 3330, demonstrates delivery and
quantity discounts, adds an RC-751, assigns safe QA contact details, and opens
the order confirmation. It never saves a case, creates a lead, sends a quote,
or submits an order.

## Files

- `playwright/record-poc.mjs`: safe browser-recording flow.
- `playwright/record-v2.mjs`: full safe V2 browser-recording flow.
- `raw/configure-3330-poc.webm`: unedited 1920 x 1080 Playwright recording.
- `raw/configure-3330-v2-raw.webm`: unedited 1920 x 1080 V2 recording.
- `raw/configure-3330-v2-events.json`: editorial timing markers and safety result.
- `hyperframes/configure-3330-v2-source.mp4`: render-optimized V2 source with one-second keyframes.
- `hyperframes/`: HyperFrames composition `configure-3330-v2`.
- `output/configure-3330-poc.mp4`: rendered 11-second proof of concept.
- `output/configure-3330-v2.mp4`: rendered 1080 x 1920 V2 tutorial.

The HyperFrames project uses version `0.8.115`. Studio cache and thumbnail
files are intentionally excluded from Git.
