import { connection } from 'next/server'
import { Suspense } from 'react'

async function SlowContent() {
  // The static shell is prefetched, so a navigation to this route commits
  // immediately and only this part is still being requested.
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 3000))

  return <p id="slow">Slow</p>
}

export default function Slow() {
  return (
    <Suspense fallback={<p id="slow-fallback">Loading</p>}>
      <SlowContent />
    </Suspense>
  )
}
