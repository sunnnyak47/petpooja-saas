import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

/**
 * SparkLine
 * SVG sparkline chart with optional filled area and smooth cubic-bezier curve.
 *
 * Props:
 *   data    (number[]) – array of data points
 *   color   (string)   – line/fill color
 *   width   (number)   – chart width (default 80)
 *   height  (number)   – chart height (default 30)
 *   filled  (boolean)  – if true, draws filled gradient area (default false)
 */
export default function SparkLine({
  data = [],
  color = '#C9A84C',
  width = 80,
  height = 30,
  filled = false,
}) {
  const path = useMemo(() => {
    if (!data || data.length < 2) return { line: '', area: '' };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const padding = 2;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;

    // Map data points to SVG coordinates
    const points = data.map((d, i) => ({
      x: padding + (i / (data.length - 1)) * innerWidth,
      y: padding + innerHeight - ((d - min) / range) * innerHeight,
    }));

    // Build smooth cubic bezier path
    let linePath = `M ${points[0].x},${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];

      // Control points: 1/3 of the horizontal distance
      const cpx = (next.x - curr.x) / 3;

      const cp1x = curr.x + cpx;
      const cp1y = curr.y;
      const cp2x = next.x - cpx;
      const cp2y = next.y;

      linePath += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${next.x},${next.y}`;
    }

    // Area path closes back along the bottom
    const last = points[points.length - 1];
    const first = points[0];
    const areaPath =
      linePath +
      ` L ${last.x},${height - padding} L ${first.x},${height - padding} Z`;

    return { line: linePath, area: areaPath };
  }, [data, width, height]);

  if (!data || data.length < 2) return <View style={{ width, height }} />;

  const gradId = `sparkGrad_${color.replace('#', '')}`;

  return (
    <Svg width={width} height={height}>
      {filled && (
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
      )}

      {/* Filled area */}
      {filled && (
        <Path
          d={path.area}
          fill={`url(#${gradId})`}
          stroke="none"
        />
      )}

      {/* Sparkline */}
      <Path
        d={path.line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
