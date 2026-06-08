# Timan 2620 — Viewer images

Drop your original Timan 2620 photos into the folders below. Files must be
served exactly as uploaded — do not recolor, crop, upscale or recompress.

## Naming convention

Use zero-padded sequential frames per configuration:

  01.jpg, 02.jpg, 03.jpg, …, 08.jpg

`.jpg`, `.png` and `.webp` all work. If you change the extension, update the
matching `imageSequence` entries in `src/data/timan2620Viewer.ts`.

## Folders

  public/images/timan-2620/standard/            01.jpg .. 08.jpg   (8 rotation frames)
  public/images/timan-2620/v-plow/              01.jpg             (single image, no rotation)
  public/images/timan-2620/salt-spreader/       01.jpg
  public/images/timan-2620/cab/                 01.jpg
  public/images/timan-2620/full-winter-setup/   01.jpg
  public/images/timan-2620/brush/               01.jpg

Add more frames later — the viewer automatically becomes a drag-to-rotate
sequence as soon as a folder contains ≥ 2 images (update `imageSequence`).
