import { describe, expect, it } from "vitest";
import {
  SYSTEM_DNA_INITIAL_ZOOM,
  SYSTEM_DNA_MAX_ZOOM,
  SYSTEM_DNA_MIN_ZOOM,
  SYSTEM_DNA_WHEEL_SENSITIVITY,
  centerPanOnWorldPoint,
  fitViewportToPoints,
  screenToWorld,
  worldToScreen,
  zoomToScreenPoint,
  zoomToWorldPoint,
} from "@/lib/systemDnaViewport";

describe("system DNA viewport zoom", () => {
  const pan = { x: -520, y: -360 };

  it.each([
    ["center", { x: 640, y: 360 }],
    ["left side", { x: 80, y: 360 }],
    ["right side", { x: 1200, y: 360 }],
    ["top", { x: 640, y: 70 }],
    ["bottom", { x: 640, y: 690 }],
  ])("keeps the same world point under the cursor at %s", (_label, point) => {
    const oldZoom = 1;
    const newZoom = 1.2;
    const before = screenToWorld(point, pan, oldZoom);
    const nextPan = zoomToScreenPoint({ pan, oldZoom, newZoom, point });
    const after = screenToWorld(point, nextPan, newZoom);

    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
  });

  it("can keep a fixed world point under a moving touch midpoint", () => {
    const worldPoint = { x: 1500, y: 980 };
    const screenPoint = { x: 760, y: 420 };
    const nextPan = zoomToWorldPoint({ worldPoint, newZoom: 1.35, screenPoint });
    const rendered = worldToScreen(worldPoint, nextPan, 1.35);

    expect(rendered.x).toBeCloseTo(screenPoint.x, 8);
    expect(rendered.y).toBeCloseTo(screenPoint.y, 8);
  });

  it("uses a calibrated start zoom for a denser 100 percent browser view", () => {
    expect(SYSTEM_DNA_INITIAL_ZOOM).toBe(0.38);
    expect(SYSTEM_DNA_MIN_ZOOM).toBeLessThan(SYSTEM_DNA_INITIAL_ZOOM);
    expect(SYSTEM_DNA_MAX_ZOOM).toBe(1.65);
    expect(SYSTEM_DNA_WHEEL_SENSITIVITY).toBeLessThan(0.0012);
  });

  it("can center Timan Partner Portal from its actual world position", () => {
    const viewport = { width: 1440, height: 760 };
    const portalCenter = { x: 1400, y: 900 };
    const nextPan = centerPanOnWorldPoint(portalCenter, viewport, SYSTEM_DNA_INITIAL_ZOOM);
    const rendered = worldToScreen(portalCenter, nextPan, SYSTEM_DNA_INITIAL_ZOOM);

    expect(rendered.x).toBeCloseTo(viewport.width / 2, 8);
    expect(rendered.y).toBeCloseTo(viewport.height / 2, 8);
  });

  it("fits to actual visible point bounds instead of a fixed pan offset", () => {
    const viewport = { width: 1440, height: 760 };
    const points = [
      { x: 920, y: 520 },
      { x: 1400, y: 900 },
      { x: 2230, y: 940 },
    ];

    const fitted = fitViewportToPoints({ points, viewport });
    expect(fitted).not.toBeNull();
    expect(fitted?.zoom).toBeGreaterThanOrEqual(SYSTEM_DNA_MIN_ZOOM);
    expect(fitted?.zoom).toBeLessThanOrEqual(SYSTEM_DNA_MAX_ZOOM);

    const renderedCenter = worldToScreen({ x: 1575, y: 730 }, fitted!.pan, fitted!.zoom);
    expect(renderedCenter.x).toBeCloseTo(viewport.width / 2, 8);
    expect(renderedCenter.y).toBeCloseTo(viewport.height / 2, 8);
  });
});
