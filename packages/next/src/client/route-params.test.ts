import { getRenderedSearch, stripFlightMarkerFromSearch } from './route-params'

function createResponse(url: string, headers: Record<string, string>) {
  return {
    url,
    headers: new Headers(headers),
  } as Response
}

describe('stripFlightMarkerFromSearch', () => {
  it.each([
    ['?_rsc=abc123', ''],
    ['?foo=1&_rsc=abc123', '?foo=1'],
    ['?_rsc=abc123&foo=1', '?foo=1'],
    // The marker is set without a value when the hash is empty.
    ['?foo=1&_rsc', '?foo=1'],
    // Accepts a raw query string too, for the rewritten query header.
    ['foo=1&_rsc=abc123', '?foo=1'],
    // Untouched when there's no marker.
    ['', ''],
    ['?foo=1', '?foo=1'],
    // Params that merely look like the marker are kept.
    ['?my_rsc=1', '?my_rsc=1'],
    ['?foo=_rsc', '?foo=_rsc'],
  ])('turns %j into %j', (search, expected) => {
    expect(stripFlightMarkerFromSearch(search)).toBe(expected)
  })

  it('does not re-encode the remaining params', () => {
    // `URLSearchParams` would turn `%20` into `+`, which would be visible in
    // the address bar once this reaches the canonical URL.
    expect(stripFlightMarkerFromSearch('?q=a%20b&_rsc=abc123')).toBe('?q=a%20b')
  })
})

describe('getRenderedSearch', () => {
  it('strips the RSC flight marker from the response URL', () => {
    expect(
      getRenderedSearch(
        createResponse('http://localhost/?foo=1&_rsc=abc123', {})
      )
    ).toBe('?foo=1')
  })

  it('strips the RSC flight marker from the rewritten query header', () => {
    // An upstream/external Next.js server computes this header from its own
    // request URL, which carries the forwarded `_rsc` marker (see the
    // "always forward the `_rsc` search parameter" logic in server/web/adapter).
    expect(
      getRenderedSearch(
        createResponse('http://localhost/target?_rsc=abc123', {
          'x-nextjs-rewritten-query': 'foo=1&_rsc=abc123',
        })
      )
    ).toBe('?foo=1')
  })

  it('returns an empty search when the rewritten query header only has the marker', () => {
    expect(
      getRenderedSearch(
        createResponse('http://localhost/target?_rsc=abc123', {
          'x-nextjs-rewritten-query': '_rsc=abc123',
        })
      )
    ).toBe('')
  })
})
