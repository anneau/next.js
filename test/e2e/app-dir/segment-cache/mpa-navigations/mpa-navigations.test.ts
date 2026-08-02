import type * as Playwright from 'playwright'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('segment cache (MPA navigations)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('ppr is disabled', () => {})
    return
  }

  type ElementWithExpando = Element & { __expando?: boolean }

  it('triggers MPA navigation when navigating to a different root layout', async () => {
    const browser = await next.browser('/')

    // Set an expando on the html element so we can detect if the page
    // gets unloaded.
    const html = await browser.elementByCss('html')

    await html.evaluate((el) => ((el as ElementWithExpando).__expando = true))

    // Navigate to a page with a different root layout.
    const link = await browser.elementByCss(`a[href="/foo"]`)
    await link.click()

    // The expando should not be present because we did a full-page navigation.
    await retry(async () => {
      const htmlAfterNav = await browser.elementByCss('html')
      expect(
        await htmlAfterNav.evaluate(
          (el) => (el as ElementWithExpando).__expando
        )
      ).toBe(undefined)
    })
  })

  it(
    'triggers MPA navigation when navigating to a different root layout, ' +
      'during a navigation where a root param also changed',
    async () => {
      // Testing this scenario because a root param change alone does not
      // trigger an MPA navigation, but if an inner segment changes before the
      // root layout, then we should trigger an MPA navigation. This case is
      // handled slightly differently in the implementation than the case where
      // there's no root param change.
      const browser = await next.browser('/foo')

      // Set an expando on the html element so we can detect if the page
      // gets unloaded.
      const html = await browser.elementByCss('html')
      await html.evaluate((el) => ((el as ElementWithExpando).__expando = true))

      // Navigate to a page with a different root layout.
      const link = await browser.elementByCss(`a[href="/bar/inner"]`)
      await link.click()

      // The expando should not be present because we did a full-page navigation.
      await retry(async () => {
        const htmlAfterNav = await browser.elementByCss('html')
        expect(
          await htmlAfterNav.evaluate(
            (el) => (el as ElementWithExpando).__expando
          )
        ).toBe(undefined)
      })
    }
  )

  it('does not trigger an MPA navigation when an abandoned navigation fails', async () => {
    // Clicking a prefetched link commits the navigation immediately and leaves
    // the dynamic request in flight. Going back abandons that navigation, but
    // the request keeps running; when it fails it must not drag the user back
    // to the page they navigated away from.
    const docs: string[] = []
    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        page.on('request', (r) => {
          if (r.resourceType() === 'document') docs.push(r.url())
        })
        page.route('**/slow**', async (route) => {
          const request = route.request()
          const headers = request.headers()
          const isPrefetch =
            'next-router-prefetch' in headers ||
            'next-router-segment-prefetch' in headers
          if (
            request.resourceType() !== 'document' &&
            request.url().includes('_rsc') &&
            !isPrefetch
          ) {
            // Fail the dynamic request, but only after the back navigation has
            // had time to happen.
            await new Promise((resolve) => setTimeout(resolve, 1500))
            await route.abort('failed')
            return
          }
          await route.continue()
        })
      },
    })

    // Set an expando on the html element so we can detect if the page
    // gets unloaded.
    const html = await browser.elementByCss('html')
    await html.evaluate((el) => ((el as ElementWithExpando).__expando = true))

    // Let the link prefetch, so that the navigation commits right away.
    await browser.eval('new Promise((resolve) => setTimeout(resolve, 1000))')

    const link = await browser.elementByCss(`a[href="/slow"]`)
    await link.click()
    await retry(async () => {
      expect(await browser.url()).toContain('/slow')
    })

    await browser.back()
    await retry(async () => {
      expect(await browser.url()).not.toContain('/slow')
    })

    // Wait until well past the point where the abandoned request has failed.
    await browser.eval('new Promise((resolve) => setTimeout(resolve, 3000))')

    // The only document request should be the initial page load. The abandoned
    // navigation must not have loaded its page.
    expect(docs.filter((url) => new URL(url).pathname === '/slow')).toEqual([])

    // And the page should never have been unloaded.
    const htmlAfterNav = await browser.elementByCss('html')
    expect(
      await htmlAfterNav.evaluate((el) => (el as ElementWithExpando).__expando)
    ).toBe(true)
  })
})
