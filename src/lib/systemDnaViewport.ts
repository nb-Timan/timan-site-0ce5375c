export type ViewportPoint = { x: number; y: number };
export type ViewportPan = { x: number; y: number };
export type ViewportSize = { width: number; height: number };

export const SYSTEM_DNA_MIN_ZOOM = 0.32;
export const SYSTEM_DNA_MAX_ZOOM = 1.65;
export const SYSTEM_DNA_INITIAL_ZOOM = 0.38;
export const SYSTEM_DNA_ZOOM_BUTTON_STEP = 0.07;
export const SYSTEM_DNA_WHEEL_SENSITIVITY = 0.00075;
export const SYSTEM_DNA_FIT_PADDING = 96;

export function clampSystemDnaZoom(value: number) {
  return Math.min(SYSTEM_DNA_MAX_ZOOM, Math.max(SYSTEM_DNA_MIN_ZOOM, value));
}

export function screenToWorld(point: ViewportPoint, pan: ViewportPan, zoom: number): ViewportPoint {
  return {
    x: (point.x - pan.x) / zoom,
    y: (point.y - pan.y) / zoom,
  };
}

export function worldToScreen(point: ViewportPoint, pan: ViewportPan, zoom: number): ViewportPoint {
  return {
    x: point.x * zoom + pan.x,
    y: point.y * zoom + pan.y,
  };
}

export function zoomToScreenPoint({
  pan,
  oldZoom,
  newZoom,
  point,
}: {
  pan: ViewportPan;
  oldZoom: number;
  newZoom: number;
  point: ViewportPoint;
}): ViewportPan {
  const worldPoint = screenToWorld(point, pan, oldZoom);
  return {
    x: point.x - worldPoint.x * newZoom,
    y: point.y - worldPoint.y * newZoom,
  };
}

export function zoomToWorldPoint({
  worldPoint,
  newZoom,
  screenPoint,
}: {
  worldPoint: ViewportPoint;
  newZoom: number;
  screenPoint: ViewportPoint;
}): ViewportPan {
  return {
    x: screenPoint.x - worldPoint.x * newZoom,
    y: screenPoint.y - worldPoint.y * newZoom,
  };
}

export function centerPanOnWorldPoint(point: ViewportPoint, viewport: ViewportSize, zoom: number): ViewportPan {
  return {
    x: viewport.width / 2 - point.x * zoom,
    y: viewport.height / 2 - point.y * zoom,
  };
}

export function calculateViewportBounds(points: ViewportPoint[]) {
  if (points.length === 0) return null;

  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: points[0].x,
      maxX: points[0].x,
      minY: points[0].y,
      maxY: points[0].y,
    },
  );
}

export function fitViewportToPoints({
  points,
  viewport,
  padding = SYSTEM_DNA_FIT_PADDING,
}: {
  points: ViewportPoint[];
  viewport: ViewportSize;
  padding?: number;
}): { zoom: number; pan: ViewportPan } | null {
  const bounds = calculateViewportBounds(points);
  if (!bounds || viewport.width <= 0 || viewport.height <= 0) return null;

  const usableWidth = Math.max(1, viewport.width - padding * 2);
  const usableHeight = Math.max(1, viewport.height - padding * 2);
  const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
  const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = clampSystemDnaZoom(Math.min(usableWidth / boundsWidth, usableHeight / boundsHeight));
  const center = {
    x: bounds.minX + boundsWidth / 2,
    y: bounds.minY + boundsHeight / 2,
  };

  return { zoom, pan: centerPanOnWorldPoint(center, viewport, zoom) };
}
