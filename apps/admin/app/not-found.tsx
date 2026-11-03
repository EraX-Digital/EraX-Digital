import { BrandMark } from '@erax/ui'

export default function NotFound() {
  return (
    <main className="erax-shell">
      <header className="erax-header">
        <BrandMark href="/login" label="Administration" />
      </header>
      <section className="erax-panel">
        <h1>Page not found</h1>
        <a href="/">Back to the dashboard</a>
      </section>
    </main>
  )
}
