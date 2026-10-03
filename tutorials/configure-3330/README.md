# Timan 3330 tutorial proof of concept

This folder is isolated from the Timan Portal application. It contains only the
browser recording and HyperFrames project used for the tutorial proof of
concept.

The Playwright flow selects a Timan 3330 and harmless local configuration
options. It never saves a case, creates a lead, sends a quote, or submits an
order.

## Files

- `playwright/record-poc.mjs`: safe browser-recording flow.
- `raw/configure-3330-poc.webm`: unedited 1920 x 1080 Playwright recording.
- `hyperframes/`: HyperFrames composition `configure-3330-poc`.
- `output/configure-3330-poc.mp4`: rendered 11-second proof of concept.

The HyperFrames project uses version `0.8.115`. Studio cache and thumbnail
files are intentionally excluded from Git.
