import { describe, expect, it } from 'vitest'
import { assetUrl } from './assetUrl.js'

describe('public image URLs across deployments', () => {
  it('includes the GitHub Pages base for posters and fallback images', () => {
    expect(assetUrl('/contest/food-star.jpg', '/gongmo-on/')).toBe('/gongmo-on/contest/food-star.jpg')
    expect(assetUrl('/contest/ck/placeholder.svg', '/gongmo-on/')).toBe('/gongmo-on/contest/ck/placeholder.svg')
  })

  it('preserves local and Render paths and already-prefixed URLs', () => {
    expect(assetUrl('/contest/food-star.jpg', '/')).toBe('/contest/food-star.jpg')
    expect(assetUrl('/gongmo-on/contest/food-star.jpg', '/gongmo-on/')).toBe('/gongmo-on/contest/food-star.jpg')
  })

  it('preserves external posters, query strings, and protocol-relative URLs', () => {
    expect(assetUrl('https://www.wevity.com/upload/poster.jpg', '/gongmo-on/')).toBe('https://www.wevity.com/upload/poster.jpg')
    expect(assetUrl('//example.com/poster.jpg', '/gongmo-on/')).toBe('//example.com/poster.jpg')
    expect(assetUrl('/contest/poster.jpg?v=2', '/gongmo-on/')).toBe('/gongmo-on/contest/poster.jpg?v=2')
  })
})
