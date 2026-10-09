import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/misc/PartnerMapPage.tsx', 'utf8');

describe('Partnerkort fullscreen toolbar', () => {
  it('keeps the one existing toolbar inside the fullscreen map element', () => {
    const mapWrapperIndex = source.indexOf('ref={mapWrapperRef}');
    const toolbarIndex = source.indexOf('The same controls stay inside the browser fullscreen element.');
    const mapContentIndex = source.indexOf('{/* Map + results panel */}');

    expect(mapWrapperIndex).toBeGreaterThan(-1);
    expect(toolbarIndex).toBeGreaterThan(mapWrapperIndex);
    expect(mapContentIndex).toBeGreaterThan(toolbarIndex);
    expect((source.match(/ref=\{mapWrapperRef\}/g) ?? [])).toHaveLength(1);
  });

  it('reuses the normal filter and view handlers instead of adding fullscreen state', () => {
    expect((source.match(/onClick=\{\(\) => toggleType\(t\)\}/g) ?? [])).toHaveLength(1);
    expect((source.match(/value=\{mapStyle\}/g) ?? [])).toHaveLength(1);
    expect((source.match(/value=\{administrativeOverlay\}/g) ?? [])).toHaveLength(1);
    expect(source).toContain('onClick={resetView}');
    expect(source).toContain('onClick={worldView}');
  });

  it('keeps the map below the fullscreen toolbar and exposes exit in that toolbar', () => {
    expect(source).toContain("isFullscreen ? 'flex h-screen w-screen flex-col rounded-none'");
    expect(source).toContain("isFullscreen ? 'flex min-h-0 flex-1'");
    expect(source).toContain("isFullscreen ? 'flex' : 'hidden md:flex'");
    expect((source.match(/document\.exitFullscreen/g) ?? [])).toHaveLength(1);
  });

  it('continues to use the shared Partnerkort component for Messe', () => {
    const messeWrapper = readFileSync('src/pages/messe/MesseWrappers.tsx', 'utf8');

    expect(messeWrapper).toContain('return <PartnerMapPage />;');
  });
});
