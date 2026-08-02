import Link from 'next/link'

export default async function Page() {
  return (
    <>
      <p>
        This link <em>should</em> trigger an MPA navigation, because it
        navigates to a different root layout:
      </p>
      <p>
        <Link href="/foo">/foo</Link>
      </p>
      <p>
        This one <em>should not</em>, even if its request fails after the
        navigation has been abandoned:
      </p>
      <p>
        <Link href="/slow">/slow</Link>
      </p>
    </>
  )
}
