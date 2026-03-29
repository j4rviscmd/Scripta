import { describe, expect, it } from 'vitest'
import {
  ImageDetectionCache,
  isImageUrlByDomain,
  isImageUrlByExtension,
  isImageUrlQuick,
} from '../imageUrlDetection'

// ---------------------------------------------------------------------------
// isImageUrlByExtension
// ---------------------------------------------------------------------------
describe('isImageUrlByExtension', () => {
  it.each([
    ['https://example.com/photo.jpg', true],
    ['https://example.com/photo.png', true],
    ['https://example.com/photo.jpeg', true],
    ['https://example.com/photo.gif', true],
    ['https://example.com/photo.webp', true],
    ['https://example.com/photo.svg', true],
    ['https://example.com/photo.avif', true],
    ['https://example.com/photo.bmp', true],
    ['https://example.com/photo.ico', true],
    ['https://example.com/photo.tiff', true],
    ['https://example.com/photo.tif', true],
  ])('detects image extension: %s → %s', (url, expected) => {
    expect(isImageUrlByExtension(url)).toBe(expected)
  })

  it('ignores query parameters', () => {
    expect(
      isImageUrlByExtension('https://example.com/photo.jpg?w=800&h=600')
    ).toBe(true)
  })

  it('ignores hash fragments', () => {
    expect(isImageUrlByExtension('https://example.com/photo.png#section')).toBe(
      true
    )
  })

  it('is case-insensitive', () => {
    expect(isImageUrlByExtension('https://example.com/Photo.JPG')).toBe(true)
    expect(isImageUrlByExtension('https://example.com/Photo.Png')).toBe(true)
  })

  it('returns false for non-image extensions', () => {
    expect(isImageUrlByExtension('https://example.com/page.html')).toBe(false)
    expect(isImageUrlByExtension('https://example.com/doc.pdf')).toBe(false)
    expect(isImageUrlByExtension('https://example.com/video.mp4')).toBe(false)
  })

  it('returns false for URLs without extension', () => {
    expect(isImageUrlByExtension('https://example.com/abc123')).toBe(false)
    expect(isImageUrlByExtension('https://imgur.com/abc123')).toBe(false)
  })

  it('returns false for invalid URLs', () => {
    expect(isImageUrlByExtension('not-a-url')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isImageUrlByDomain
// ---------------------------------------------------------------------------
describe('isImageUrlByDomain', () => {
  it('matches known image hosting domains', () => {
    expect(isImageUrlByDomain('https://i.imgur.com/abc123')).toBe(true)
    expect(isImageUrlByDomain('https://cdn.pixabay.com/photo/123')).toBe(true)
    expect(isImageUrlByDomain('https://images.unsplash.com/photo-123')).toBe(
      true
    )
    expect(isImageUrlByDomain('https://pbs.twimg.com/media/abc')).toBe(true)
    expect(
      isImageUrlByDomain('https://avatars.githubusercontent.com/u/123')
    ).toBe(true)
    expect(
      isImageUrlByDomain(
        'https://raw.githubusercontent.com/user/repo/main/img.png'
      )
    ).toBe(true)
    expect(
      isImageUrlByDomain('https://media.giphy.com/media/abc/giphy.gif')
    ).toBe(true)
    expect(isImageUrlByDomain('https://i.redd.it/abc123')).toBe(true)
    expect(isImageUrlByDomain('https://preview.redd.it/abc123')).toBe(true)
  })

  it('matches subdomains of known domains', () => {
    expect(isImageUrlByDomain('https://scontent.cdninstagram.com/v/abc')).toBe(
      true
    )
  })

  it('returns false for non-image domains', () => {
    expect(isImageUrlByDomain('https://example.com/photo')).toBe(false)
    expect(isImageUrlByDomain('https://github.com/user/repo')).toBe(false)
  })

  it('returns false for invalid URLs', () => {
    expect(isImageUrlByDomain('not-a-url')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isImageUrlQuick
// ---------------------------------------------------------------------------
describe('isImageUrlQuick', () => {
  it('returns true when extension matches', () => {
    expect(isImageUrlQuick('https://example.com/photo.jpg')).toBe(true)
  })

  it('returns true when domain matches', () => {
    expect(isImageUrlQuick('https://i.imgur.com/abc123')).toBe(true)
  })

  it('returns true when both match', () => {
    expect(isImageUrlQuick('https://i.imgur.com/abc123.png')).toBe(true)
  })

  it('returns false when neither matches', () => {
    expect(isImageUrlQuick('https://example.com/page')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ImageDetectionCache
// ---------------------------------------------------------------------------
describe('ImageDetectionCache', () => {
  it('returns undefined for cache miss', () => {
    const cache = new ImageDetectionCache()
    expect(cache.get('https://example.com/photo.jpg')).toBeUndefined()
  })

  it('stores and retrieves values', () => {
    const cache = new ImageDetectionCache()
    cache.set('https://example.com/a.jpg', true)
    expect(cache.get('https://example.com/a.jpg')).toBe(true)
  })

  it('evicts oldest entry when full', () => {
    const cache = new ImageDetectionCache(3)
    cache.set('a', true)
    cache.set('b', false)
    cache.set('c', true)
    expect(cache.size).toBe(3)

    cache.set('d', true) // should evict 'a'
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('d')).toBe(true)
    expect(cache.size).toBe(3)
  })

  it('updates existing entry without eviction', () => {
    const cache = new ImageDetectionCache(3)
    cache.set('a', true)
    cache.set('b', false)
    cache.set('a', false) // update existing
    expect(cache.get('a')).toBe(false)
    expect(cache.size).toBe(2)
  })

  it('respects custom maxSize', () => {
    const cache = new ImageDetectionCache(10)
    for (let i = 0; i < 15; i++) {
      cache.set(`url-${i}`, true)
    }
    expect(cache.size).toBe(10)
  })
})
