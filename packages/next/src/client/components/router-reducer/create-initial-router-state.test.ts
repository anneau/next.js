import type {
  CacheNodeSeedData,
  FlightRouterState,
  InitialRSCPayload,
} from '../../../shared/lib/app-router-types'
import { PrefetchHint } from '../../../shared/lib/app-router-types'
import { createInitialRouterState } from './create-initial-router-state'

const initialTree: FlightRouterState = [
  '',
  {
    children: ['__PAGE__', {}, null, null, 0],
  },
  null,
  null,
  PrefetchHint.IsRootLayoutOrAbove,
]

const initialSeedData: CacheNodeSeedData = [
  null,
  {
    children: [null, {}, null, false, null],
  },
  null,
  false,
  null,
]

function createPayload(): InitialRSCPayload {
  return {
    b: 'test-build-id',
    c: ['', ''],
    q: '',
    i: false,
    f: [[initialTree, initialSeedData, null, false]],
    m: undefined,
    G: [() => null, undefined],
    S: true,
    h: null,
  }
}

describe('createInitialRouterState', () => {
  it('strips the RSC flight marker from the initial canonical URL', () => {
    const state = createInitialRouterState({
      navigatedAt: Date.now(),
      initialRSCPayload: createPayload(),
      location: new URL('http://localhost/?_rsc=abc123') as unknown as Location,
    })

    // `_rsc` is an internal request marker. If it ends up in the canonical URL,
    // the router writes it back to the address bar via `history.replaceState`.
    expect(state.canonicalUrl).toBe('/')
  })

  it('preserves real search params while stripping the flight marker', () => {
    const state = createInitialRouterState({
      navigatedAt: Date.now(),
      initialRSCPayload: createPayload(),
      location: new URL(
        'http://localhost/dashboard?foo=1&_rsc=abc123#section'
      ) as unknown as Location,
    })

    expect(state.canonicalUrl).toBe('/dashboard?foo=1#section')
  })

  it('uses the canonical URL from the payload when there is no location (SSR)', () => {
    const state = createInitialRouterState({
      navigatedAt: Date.now(),
      initialRSCPayload: createPayload(),
      location: null,
    })

    expect(state.canonicalUrl).toBe('/')
  })
})
