export type ViewportPoint = { x: number; y: number };
export type ViewportPan = { x: number; y: number };

export function clampSystemDnaZoom(value: number) {
  return Math.min(1.85, Math.max(0.38, value));
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
