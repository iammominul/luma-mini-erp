'use client';

import { useId } from 'react';

/**
 * Restraint is the point (owner, 2026-10-07: nothing may look AI made). The
 * shade is a sixteen percent lift at the top edge and the shadow a pixel and a
 * half: enough that a bar reads as a solid object on the card, never enough to
 * read as gloss. A glossy highlight, a glow, a colored shadow or a dark rim
 * at the base is the generated-dashboard look, and is out.
 *
 * Depth for chart marks: a fill shaded lighter at its lit edge, and a soft
 * shadow under the mark (the shadow is `chart-depth` in globals.css).
 *
 * This is the owner's call for a chart with some dimension to it (2026-10-07),
 * and it is held to one rule: depth may never change what a mark measures.
 * A bar's length, a slice's angle and an area's height are exactly what they
 * were flat. That is why there is no perspective anywhere: a tilted pie draws
 * its front slices larger than their share and a 3D bar stands taller than its
 * figure, and a screen somebody bills from cannot show a wrong size. Shading
 * and shadow sit on top of the true geometry and add nothing to it.
 *
 * The colors arrive as `var(--color-...)` tokens, so each stop is set through
 * `style`, where a custom property resolves; an SVG presentation attribute
 * would take the text literally.
 */

/** An id safe inside `url(#...)`: React's own ids carry colons. */
export function useChartId(): string {
  return `c${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export const shadeUrl = (prefix: string, index: number) =>
  `url(#${prefix}-${index})`;

/**
 * One gradient per color. `vertical` lights a bar or a strip from above;
 * `diagonal` lights a donut slice from the upper left; `fade` is an area's
 * fill, the series color at the line falling away to nothing at the base.
 */
export function ShadeDefs({
  prefix,
  colors,
  kind = 'vertical',
}: {
  prefix: string;
  colors: readonly string[];
  kind?: 'vertical' | 'diagonal' | 'fade';
}) {
  const box =
    kind === 'diagonal'
      ? { x1: '0', y1: '0', x2: '1', y2: '1' }
      : { x1: '0', y1: '0', x2: '0', y2: '1' };
  return (
    <defs>
      {colors.map((color, index) => (
        <linearGradient key={index} id={`${prefix}-${index}`} {...box}>
          {kind === 'fade' ? (
            <>
              <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.18 }} />
              <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.01 }} />
            </>
          ) : (
            <>
              <stop
                offset="0%"
                style={{
                  stopColor: `color-mix(in srgb, ${color} 84%, white)`,
                }}
              />
              <stop offset="100%" style={{ stopColor: color }} />
            </>
          )}
        </linearGradient>
      ))}
    </defs>
  );
}
