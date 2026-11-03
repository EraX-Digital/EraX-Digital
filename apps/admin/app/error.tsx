'use client'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="erax-shell">
      <section className="erax-panel">
        <h1>Administration error</h1>
        <p className="erax-muted">{error.message}</p>
        <button className="erax-button" type="button" onClick={() => reset()}>
          Try again
        </button>
      </section>
    </main>
  )
}
