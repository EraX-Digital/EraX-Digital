import { BrandMark } from '@erax/ui'
import { CompanyLink } from '../../components/company-link'

export default function AboutPage() {
  return (
    <main className="erax-shell">
      <header className="erax-header">
        <BrandMark href="/" label="Social" />
        <nav className="erax-nav">
          <a href="/">Home</a>
          <a href="/login">Sign in</a>
          <CompanyLink />
        </nav>
      </header>
      <article className="erax-panel">
        <p className="erax-kicker">EraX Digital</p>
        <h1>About EraX</h1>
        <p>
          EraX Digital is an independent Web3 technology company developing a connected digital ecosystem
          that brings together social networking, digital ownership, wallet infrastructure, and
          creator-focused experiences.
        </p>
        <p>
          EraX Social is the social product in this application. The tagline is Connect. Create. Own.
          Accounts, posts, communities, and messages work without a wallet.
        </p>
        <h2>What the company site says</h2>
        <p>
          The company site describes one ecosystem with multiple possibilities: social experiences, digital
          ownership, and creator opportunities. Ethereum is the planned primary network for ownership and
          settlement. Base is the first Layer 2 prioritized for everyday activity.
        </p>
        <p>Four principles are listed there: Accessibility, User Ownership, Transparency, and Innovation.</p>
        <ul>
          <li>
            EraX Social is described as a SocialFi platform for profiles, feeds, publishing, communities,
            messaging, and wallet connectivity.
          </li>
          <li>
            EraX Wallet is described as a wallet experience for Ethereum and Base connectivity, asset
            management, and transaction authorization. This app includes a wallet area. Portfolio prices are
            not shown.
          </li>
          <li>
            EraX Creator is described as a planned creator platform for profiles, content management,
            subscriptions, paid content, tipping, and monetization. On-chain registration and tips are not
            enabled here because the programs are not deployed.
          </li>
          <li>EraX Assets is described as a potential future product and is not currently operational.</li>
        </ul>
        <p>
          The company site says products described there are in development and are not publicly available,
          and that the site is informational. It lists the SocialFi platform as an upcoming phase after a
          completed strategic foundation and core infrastructure. This application is an in-development build
          of the social layer, not a claim that the company roadmap is finished.
        </p>
        <p>The company site names Yaroslav Boichuk as Co-Founder.</p>
        <p>
          The stated vision is a connected digital world where people, communities, and digital assets can
          interact, create value, and grow together. The stated mission is simpler access to Web3 technology,
          social experiences, digital ownership, and financial infrastructure in one ecosystem.
        </p>
        <p>
          There is no EraX token in this application. This page does not add staking, yield, or fees.
        </p>
        <p>
          <a href="https://erax.digital/" target="_blank" rel="noopener noreferrer">
            erax.digital
          </a>
          {' · '}
          <a href="mailto:contact@erax.digital">contact@erax.digital</a>
        </p>
        <p className="erax-muted">© 2026 EraX Digital</p>
      </article>
    </main>
  )
}
