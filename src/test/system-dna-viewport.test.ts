import { describe, expect, it } from "vitest";
import { screenToWorld, worldToScreen, zoomToScreenPoint, zoomToWorldPoint } from "@/lib/systemDnaViewport";

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
});
