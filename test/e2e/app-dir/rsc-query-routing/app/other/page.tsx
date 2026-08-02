import Link from 'next/link'

export default function Other() {
  return (
    <div>
      <p id="other">Other</p>
      {/* Not prefetched, so clicking it has to block on an RSC request. */}
      <Link id="to-slow" prefetch={false} href="/slow">
        Slow Link
      </Link>
    </div>
  )
}
