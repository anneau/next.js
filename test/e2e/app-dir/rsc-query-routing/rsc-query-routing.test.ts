import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('rsc-query-routing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should contain rsc query in rsc request when redirect the page', async () => {
    const browser = await next.browser('/redirect')

    const rscRequestUrls: string[] = []
    browser.on('request', (req) => {
      if (req.url().includes('?_rsc=')) {
        rscRequestUrls.push(req.url())
      }
    })

    // Click redirect link
    const link = await browser.elementByCss('a')
    await link.click()

    // Wait for the page load to be completed
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Redirect Dest')
    })

    // The redirect source and dest urls should both contain the rsc query
    expect(rscRequestUrls[0]).toContain('/redirect/source')
    expect(rscRequestUrls[1]).toContain('/redirect/dest')
  })

  it('should contain rsc query in rsc request when rewrite the page', async () => {
    const browser = await next.browser('/rewrite')

    const rscRequestUrls: string[] = []
    browser.on('request', (req) => {
      if (req.url().includes('?_rsc=')) {
        rscRequestUrls.push(req.url())
      }
    })

    // Click redirect link
    const link = await browser.elementByCss('a')
    await link.click()

    // Wait for the page load to be completed
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Rewrite Dest')
    })

    // The rewrite source url should contain the rsc query
    expect(rscRequestUrls[0]).toContain('/rewrite/source')
  })

  it('should not keep the rsc query in the browser url when the document is loaded with one', async () => {
    const browser = await next.browser('/?_rsc=abc123')

    // The page renders fine — the server strips the rsc query before routing.
    expect(await browser.elementByCss('#home').text()).toBe('Home')

    // ...but the address bar should not be left with the internal marker.
    await retry(async () => {
      expect(await browser.url()).toBe(next.url + '/')
    })
  })

  it('should not keep the rsc query in the browser url when it is mixed with real search params', async () => {
    const browser = await next.browser('/?foo=1&_rsc=abc123')

    expect(await browser.elementByCss('#home').text()).toBe('Home')

    await retry(async () => {
      expect(await browser.url()).toBe(next.url + '/?foo=1')
    })
  })

  it('should not put the rsc query in the browser url when a navigation is interrupted by a back navigation', async () => {
    const browser = await next.browser('/')

    // Build up a history entry to go back to.
    await browser.elementByCss('#to-other').click()
    await retry(async () => {
      expect(await browser.elementByCss('#other').text()).toBe('Other')
    })

    let slowResponses = 0
    browser.on('response', (res) => {
      if (new URL(res.url()).pathname === '/slow') {
        slowResponses++
      }
    })

    // Start a navigation that has to block on an RSC request, then go back
    // before that request resolves.
    await browser.elementByCss('#to-slow').click()
    await browser.back()

    await retry(async () => {
      expect(await browser.elementByCss('#home').text()).toBe('Home')
    })

    // Wait for the interrupted navigation's request to land, since it's the
    // response handling that could still write to the history.
    await retry(async () => {
      expect(slowResponses).toBeGreaterThan(0)
    }, 10_000)

    expect(await browser.url()).toBe(next.url + '/')
  })
})
