import { connection } from 'next/server'

export default async function Slow() {
  // Force a dynamic render, then stall so there's a window in which the
  // navigation's RSC request is still in flight.
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 3000))

  return <p id="slow">Slow</p>
}
