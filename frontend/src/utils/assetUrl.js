// Public assets live under Vite's deployment base on GitHub Pages.
// Remote poster URLs and already-prefixed paths must stay unchanged.
export function assetUrl(path, base = import.meta.env.BASE_URL) {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return path
  if (base === '/' || path.startsWith(base)) return path
  return `${base}${path.slice(1)}`
}
