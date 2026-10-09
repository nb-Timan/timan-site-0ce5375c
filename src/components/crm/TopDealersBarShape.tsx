type DealerBarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  payload?: { name?: string; value?: number };
  background?: { width?: number };
  valueFormatter: (value: number) => string;
};

function truncateDealerBarLabel(name: string, width: number) {
  const maxCharacters = Math.max(10, Math.floor((width - 20) / 6.4));
  return name.length > maxCharacters ? `${name.slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…` : name;
}

export function DealerBarShape({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value = 0,
  payload,
  background,
  valueFormatter,
}: DealerBarShapeProps) {
  const name = payload?.name ?? "";
  const numericValue = Number(payload?.value ?? value);
  const trackWidth = Math.max(width, background?.width ?? 0);
  const accessibleLabel = `${name}: ${valueFormatter(numericValue)}`;

  return (
    <g role="img" aria-label={accessibleLabel}>
      <title>{accessibleLabel}</title>
      <rect x={x} y={y} width={trackWidth} height={height} rx={4} fill="#ecfdf5" />
      <rect x={x} y={y} width={width} height={height} rx={4} fill="#34d399" />
      <text
        x={x + 10}
        y={y + height / 2}
        dominantBaseline="middle"
        fill="#064e3b"
        fontSize={10}
        fontWeight={600}
        pointerEvents="none"
      >
        {truncateDealerBarLabel(name, trackWidth)}
      </text>
    </g>
  );
}
