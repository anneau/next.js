import type * as Playwright from 'playwright'
import type { ChildProcess } from 'child_process'
import type { Server } from 'http'
import { createRouterAct } from 'router-act'
import { findPort } from 'next-test-utils'
import { isNextDeploy, isNextDev, nextTestSetup } from 'e2e-utils'
import { createFakeCDN } from './server.mjs'

describe('segment cache (CDN cache busting)', () => {
  if (isNextDev || isNextDeploy) {
    test('should not run during dev or deploy test runs', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // TODO(runtime-ppr): add tests for runtime prefetches

  // To debug these tests locally, run:
  //   node start.mjs
  //
  // This will start the Next app and also a proxy server that simulates a CDN.
  // Like certain real-world CDNs, our fake CDN doesn't respect the Vary header.
  // It only uses the URL.
  let nextChild: ChildProcess | undefined
  let nextExit: Promise<any> | undefined
  let cdnServer: Server
  let port: number

  beforeAll(async () => {
    await next.build()
    const nextPort = await findPort()
    const proxyPort = (port = await findPort())

    let resolveReady!: () => void
    const readyPromise = new Promise<void>((r) => (resolveReady = r))
    nextExit = next
      .runCommand(['start', '-p', String(nextPort)], {
        onStdout(msg) {
          if (/Ready/.test(msg)) resolveReady()
        },
        instance(p) {
          nextChild = p
        },
      })
      .finally(() => resolveReady())
    await readyPromise

    cdnServer = await createFakeCDN(nextPort)
    await new Promise<void>((resolve, reject) => {
      cdnServer.on('error', reject)
      cdnServer.listen(proxyPort, () => resolve())
    })
  })

  afterAll(async () => {
    if (cdnServer) {
      await new Promise<void>((resolve) => cdnServer.close(() => resolve()))
    }
    nextChild?.kill()
    await nextExit?.catch(() => {})
  })

  it(
    "perform fully prefetched navigation with a CDN that doesn't respect " +
      'the Vary header',
    async () => {
      let act
      const browser = await next.browser('/', {
        baseUrl: port,
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      await act(
        async () => {
          const linkToggle = await browser.elementByCss(
            '[data-link-accordion="/target-page"]'
          )
          await linkToggle.click()
        },
        {
          includes: 'Target page',
        }
      )

      await act(async () => {
        const link = await browser.elementByCss('a[href="/target-page"]')
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')
      }, 'no-requests')
    }
  )

  it(
    'prevent cache poisoning attacks by responding with a redirect to correct ' +
      'cache busting query param if a custom header is sent during a prefetch ' +
      'without a corresponding cache-busting search param',
    async () => {
      const browser = await next.browser('/', { baseUrl: port })
      const { status, responseUrl, redirected } = await browser.eval(
        async () => {
          const res = await fetch('/target-page', {
            headers: {
              rsc: '1',
              'next-router-prefetch': '1',
              'next-router-segment-prefetch': '/_tree',
            },
          })
          return {
            status: res.status,
            responseUrl: res.url,
            redirected: res.redirected,
          }
        }
      )
      expect(status).toBe(200)
      expect(responseUrl).toContain('_rsc=')
      expect(redirected).toBe(true)
    }
  )

  it('does not let the cache busting redirect be cached and served to a document request', async () => {
    // The redirect above is generated for a *request* that carried RSC headers.
    // A CDN that ignores Vary keys it on the URL alone, so if the redirect is
    // cacheable it can later be served to a plain document request for the same
    // URL, sending the browser to a `_rsc` URL as a top-level navigation.
    const url = `http://localhost:${port}/poison-target`

    const rscRes = await fetch(url, {
      headers: {
        rsc: '1',
        'next-router-prefetch': '1',
        'next-router-segment-prefetch': '/_tree',
      },
      redirect: 'manual',
    })
    // Sanity check: this is the redirect we're worried about.
    expect(rscRes.status).toBe(307)
    expect(rscRes.headers.get('location')).toContain('_rsc')

    // The document request must be unaffected by it.
    const documentRes = await fetch(url)
    expect(documentRes.status).toBe(200)
    expect(documentRes.redirected).toBe(false)
    expect(new URL(documentRes.url).search).toBe('')
    expect(documentRes.headers.get('content-type')).toContain('text/html')
    expect(await documentRes.text()).toContain(
      '<div id="poison-target">Poison target</div>'
    )

    // Same thing in a real browser, where following the redirect would be a
    // top-level navigation: the page renders either way, but the address bar
    // would be left with an internal search param.
    const browser = await next.browser('/poison-target', { baseUrl: port })
    expect(await browser.elementById('poison-target').text()).toBe(
      'Poison target'
    )
    const browserUrl = new URL(await browser.url())
    expect(browserUrl.pathname).toBe('/poison-target')
    expect(browserUrl.search).toBe('')

    // A shared cache must not store the redirect in the first place, because
    // it depends on request headers the cache may not be keyed on.
    expect(rscRes.headers.get('cache-control')).toContain('no-store')
  })

  it('ignores invalid RSC header values when serving a document request', async () => {
    const url = new URL(`http://localhost:${port}/target-page`)
    url.searchParams.set('test', 'invalid-rsc-header')

    const invalidHeaderRes = await fetch(url, {
      headers: {
        rsc: '0',
      },
    })

    expect(invalidHeaderRes.status).toBe(200)
    expect(invalidHeaderRes.headers.get('content-type')).toContain('text/html')
    expect(await invalidHeaderRes.text()).toContain(
      '<div id="target-page">Target page</div>'
    )

    const htmlRes = await fetch(url)

    expect(htmlRes.status).toBe(200)
    expect(htmlRes.headers.get('content-type')).toContain('text/html')
    expect(await htmlRes.text()).toContain(
      '<div id="target-page">Target page</div>'
    )
  })

  it(
    'perform fully prefetched navigation when a third-party proxy ' +
      'performs a redirect',
    async () => {
      let act
      const browser = await next.browser('/', {
        baseUrl: port,
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      await act(
        async () => {
          const linkToggle = await browser.elementByCss(
            '[data-link-accordion="/redirect-to-target-page"]'
          )
          await linkToggle.click()
        },
        {
          includes: 'Target page',
        }
      )

      await act(async () => {
        const link = await browser.elementByCss(
          'a[href="/redirect-to-target-page"]'
        )
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')
      }, 'no-requests')
    }
  )
})
