import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <p id="home">Home</p>
      <Link id="to-other" href="/other">
        Other Link
      </Link>
    </div>
  )
}
