import { BrandMark, SecondaryLink } from '@erax/ui'

export default function NotFound() {
  return (
    <main className="erax-shell">
      <header className="erax-header">
        <BrandMark />
      </header>
      <section className="erax-panel">
        <p className="erax-kicker">404</p>
        <h1>This page is not on EraX</h1>
        <p className="erax-muted">The address does not match a page in this build.</p>
        <SecondaryLink href="/">Back home</SecondaryLink>
      </section>
    </main>
  )
}
