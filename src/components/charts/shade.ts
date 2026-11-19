/**
 * The shading in depth.tsx, for a plain element rather than an SVG mark: a
 * ranked bar, a strip segment. Kept out of depth.tsx because that module is a
 * client one, and the components that use this render on the server.
 */
export function shadeCss(color: string): string {
  return `linear-gradient(180deg, color-mix(in srgb, ${color} 84%, white) 0%, ${color} 100%)`;
}
