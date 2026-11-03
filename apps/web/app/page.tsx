import { BrandMark, SecondaryLink } from '@erax/ui'

const available = [
  'Create an account with email and a password. A wallet is not required.',
  'Publish posts, follow people, comment, and bookmark.',
  'Join communities and send private messages.',
]

const later = [
  'Wallet connection, balances, and transfers.',
  'Creator subscriptions and on-chain payments.',
  'Ethereum, Base, and Solana indexing.',
]

export default function HomePage() {
  return (
    <main className="erax-shell">
      <header className="erax-header">
        <BrandMark />
        <nav className="erax-nav">
          <a href="/login">Sign in</a>
          <a className="erax-button" href="/register">
            Create account
          </a>
        </nav>
      </header>
      <section className="erax-hero">
        <p className="erax-kicker">EraX Digital</p>
        <h1>Connect. Create. Own.</h1>
        <p className="lede">
          EraX Social is the social layer of EraX Digital. Accounts, posts, communities, and
          messages work without a wallet. Chain connection, payments, and indexing are not in this
          build.
        </p>
        <div className="erax-actions">
          <a className="erax-button" href="/register">
            Create account
          </a>
          <SecondaryLink href="/login">Sign in</SecondaryLink>
        </div>
      </section>
      <section className="erax-grid">
        <article className="erax-card">
          <h2>Available now</h2>
          <ul>
            {available.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="erax-card">
          <h2>Not in this build</h2>
          <ul>
            {later.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  )
}
