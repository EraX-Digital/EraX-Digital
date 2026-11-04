import { BrandMark, SecondaryLink } from '@erax/ui'
import { CompanyLink } from '../components/company-link'
import { ThemeToggle } from '../components/theme-toggle'

const available = [
  'Create an account with email and a password. A wallet is not required.',
  'Sign in with Ethereum or Solana after the wallet approves a signature.',
  'Publish posts, follow people, comment, and bookmark.',
  'Join communities and send private messages.',
]

const later = [
  'Creator subscriptions and on-chain payments.',
  'A complete historical index of every past wallet transaction.',
]

export default function HomePage() {
  return (
    <main className="erax-shell">
      <header className="erax-header">
        <BrandMark />
        <nav className="erax-nav">
          <a href="/about">About</a>
          <CompanyLink />
          <ThemeToggle />
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
          messages work without a wallet. Wallet balances and transfers use a connected wallet.
          Portfolio prices are not shown.
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
      <footer className="erax-footer">
        <p>EraX Social is a product of EraX Digital. Connect. Create. Own.</p>
        <p>
          <a href="/about">About</a>
          {' · '}
          <a href="https://erax.digital/" target="_blank" rel="noopener noreferrer">
            erax.digital
          </a>
          {' · '}
          <a href="mailto:contact@erax.digital">contact@erax.digital</a>
        </p>
      </footer>
    </main>
  )
}
