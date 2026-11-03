'use client'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="erax-shell">
      <section className="erax-panel">
        <h1>Something went wrong</h1>
        <p className="erax-muted">{error.message || 'The page could not be loaded.'}</p>
        <button className="erax-button" onClick={() => reset()} type="button">
          Try again
        </button>
      </section>
    </main>
  )
}
