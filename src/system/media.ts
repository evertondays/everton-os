import type { Locale } from '../data/localize.ts'
import type { Media } from '../data/types.ts'

/** Resolves a path under public/ against the deploy base; full URLs pass through. */
export function assetUrl(src: string): string {
  if (/^(https?:|data:|blob:)/.test(src)) return src
  return import.meta.env.BASE_URL + src.replace(/^\//, '')
}

export function classicUrl(locale: Locale): string {
  return assetUrl(locale === 'en' ? 'classic/en/' : 'classic/')
}

function hash(text: string): number {
  let value = 0
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0
  return value
}

/** A generated image used until a real one is set in curriculo.json. */
export function placeholderImage(label: string): string {
  const hue = hash(label) % 360
  const text = label.replace(/[<>&]/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue} 70% 58%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 65% 38%)"/>
</linearGradient></defs>
<rect width="800" height="500" fill="url(#g)"/>
<circle cx="640" cy="110" r="150" fill="#fff" opacity=".12"/><circle cx="130" cy="430" r="200" fill="#000" opacity=".1"/>
<text x="400" y="262" fill="#fff" font-family="system-ui,sans-serif" font-size="40" font-weight="600" text-anchor="middle">${text}</text>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function mediaSrc(media: Media): string {
  return media.src ? assetUrl(media.src) : placeholderImage(media.caption)
}
