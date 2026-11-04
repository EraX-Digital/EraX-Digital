import { demoPostBodies } from './socialfi-demo-posts'

export const DEMO_BATCH = 'socialfi-demo-2026-11'
export const DEMO_PASSWORD = 'local-demo-pass-1'

const fictional = 'Fictional demo profile. Not a customer and not wallet-verified.'

export type DemoPerson = {
  username: string
  displayName: string
  location: string
  bio: string
  creator: boolean
  website: string
  role: string
}

function person(
  username: string,
  displayName: string,
  location: string,
  role: string,
  creator = false,
): DemoPerson {
  const bio = creator
    ? `${fictional} ${role}. The creator label is self-declared in this fixture.`
    : `${fictional} ${role}.`
  return {
    username,
    displayName,
    location,
    role,
    creator,
    website: `https://example.com/${username}`,
    bio,
  }
}

export const demoPeople: DemoPerson[] = [
  person('mira_ell', 'Mira Ell', 'Lisbon', 'Designs creator pages', true),
  person('nico_vale', 'Nico Vale', 'Turin', 'Writes Solidity and reviews mappings'),
  person('sena_oka', 'Sena Oka', 'Osaka', 'Runs small community rooms'),
  person('idris_holm', 'Idris Holm', 'Malmo', 'Builds Solana programs in tests', true),
  person('leah_quist', 'Leah Quist', 'Accra', 'Reads DeFi contracts for admin keys'),
  person('omar_seid', 'Omar Seid', 'Amman', 'Reviews signature and replay failures'),
  person('pia_nord', 'Pia Nord', 'Bergen', 'Designs quiet interfaces'),
  person('theo_marsh', 'Theo Marsh', 'Bristol', 'Documents Ethereum and Base', true),
  person('ada_keita', 'Ada Keita', 'Dakar', 'Reviews smart-contract pull requests'),
  person('rafi_cho', 'Rafi Cho', 'Seoul', 'Writes Rust around account lists'),
  person('noor_elm', 'Noor Elm', 'Tunis', 'Publishes essays about ownership', true),
  person('jules_park', 'Jules Park', 'Montreal', 'Builds general developer tools'),
  person('kenji_mori', 'Kenji Mori', 'Kyoto', 'Tests Solana instructions locally'),
  person('lina_berg', 'Lina Berg', 'Stockholm', 'Moderates community discussions'),
  person('samir_dal', 'Samir Dal', 'Sarajevo', 'Explains rollups without a chart'),
  person('yara_sol', 'Yara Sol', 'Recife', 'Makes creator portfolios', true),
  person('evan_pike', 'Evan Pike', 'Denver', 'Writes security checklists'),
  person('hana_ito', 'Hana Ito', 'Fukuoka', 'Designs profile layouts'),
  person('cole_reed', 'Cole Reed', 'Leeds', 'Studies asset permissions'),
  person('mina_ross', 'Mina Ross', 'Portland', 'Cares about feed honesty'),
  person('bruno_alves', 'Bruno Alves', 'Porto', 'Pairs on contract reviews'),
  person('aisha_nair', 'Aisha Nair', 'Kochi', 'Organizes community rules'),
  person('felix_grau', 'Felix Grau', 'Graz', 'Names variables and parsers'),
  person('nola_voss', 'Nola Voss', 'Antwerp', 'Writes about creator work', true),
  person('tariq_benn', 'Tariq Benn', 'Casablanca', 'Keeps Base notes in plain language'),
]

export const demoCommunities = [
  { slug: 'field-notes', name: 'Field Notes', owner: 'sena_oka', category: 'Communities', description: 'Category: communities. Short public notes from the fixture.', rules: 'Stay on the note. No scraped posts. Demo community.' },
  { slug: 'studio-hours', name: 'Studio Hours', owner: 'nola_voss', category: 'Creator economy', description: 'Category: creator economy. Drafts and published work.', rules: 'One update at a time. No payment requests. Demo community.' },
  { slug: 'quiet-web', name: 'Quiet Web', owner: 'pia_nord', category: 'Design', description: 'Category: design. Calmer interfaces.', rules: 'Describe what you built. Demo community.' },
  { slug: 'base-table', name: 'Base Table', owner: 'theo_marsh', category: 'Ethereum and Base', description: 'Category: Ethereum and Base. Network notes, no prices.', rules: 'No price talk and no token promotions. Demo community.' },
  { slug: 'solana-bench', name: 'Solana Bench', owner: 'idris_holm', category: 'Solana', description: 'Category: Solana. Local program notes.', rules: 'Label test runs as tests. Demo community.' },
  { slug: 'contract-lab', name: 'Contract Lab', owner: 'ada_keita', category: 'Development', description: 'Category: blockchain development. Review notes.', rules: 'Cite the function you mean. Demo community.' },
  { slug: 'creator-desk', name: 'Creator Desk', owner: 'mira_ell', category: 'Creator economy', description: 'Category: creator economy. Profiles and portfolios.', rules: 'Do not invent verification. Demo community.' },
  { slug: 'security-hour', name: 'Security Hour', owner: 'omar_seid', category: 'Security', description: 'Category: security. Failure modes and reviews.', rules: 'No exploit procedures. Demo community.' },
  { slug: 'defi-notes', name: 'DeFi Notes', owner: 'leah_quist', category: 'DeFi', description: 'Category: digital assets. Permissions, not forecasts.', rules: 'No yields, prices, or airdrops. Demo community.' },
  { slug: 'social-graph', name: 'Social Graph', owner: 'lina_berg', category: 'SocialFi', description: 'Category: SocialFi. Follows, feeds, and rooms.', rules: 'Talk about the graph you can see. Demo community.' },
]

const categories = [
  { name: 'Web3 and SocialFi', count: 20, community: 'social-graph' },
  { name: 'Blockchain development', count: 15, community: 'contract-lab' },
  { name: 'Ethereum and Base', count: 15, community: 'base-table' },
  { name: 'Solana ecosystem', count: 15, community: 'solana-bench' },
  { name: 'DeFi and digital assets', count: 10, community: 'defi-notes' },
  { name: 'Creator economy', count: 15, community: 'creator-desk' },
  { name: 'Communities and discussions', count: 10, community: 'field-notes' },
  { name: 'Blockchain security', count: 5, community: 'security-hour' },
  { name: 'General technology', count: 5, community: 'quiet-web' },
  { name: 'EraX product discussions', count: 10, community: null },
] as const

export type DemoCategory = (typeof categories)[number]['name']

const quoteOf: Record<number, number> = { 12: 0, 33: 20, 48: 35, 61: 51, 85: 76, 118: 110 }
const polls: Record<number, { options: string[]; closesInDays: number }> = {
  5: { options: ['The name', 'The posts', 'The follow list'], closesInDays: 21 },
  25: { options: ['msg.sender', 'tx.origin', 'A diagram of both'], closesInDays: 21 },
  28: { options: ['The unhappy path', 'The replay', 'The empty input'], closesInDays: 14 },
  39: { options: ['Like a cache', 'Like a side database', 'I would draw it'], closesInDays: 14 },
  44: { options: ['Show the testnet badge', 'Hide the network'], closesInDays: -1 },
  53: { options: ['Seeds and a diagram', 'A button label'], closesInDays: 30 },
  58: { options: ['On the account', 'In the app for now'], closesInDays: 30 },
  68: { options: ['A shared pool', 'A warehouse', 'Still looking'], closesInDays: 10 },
  78: { options: ['Show a blank', 'Hide the studio'], closesInDays: 10 },
  93: { options: ['Owner and moderator', 'Member is enough'], closesInDays: -1 },
}

export type DemoPost = {
  category: DemoCategory
  author: string
  body: string
  communitySlug: string | null
  linkUrl: string | null
  quoteOf: number | null
  poll: { options: string[]; closesInDays: number } | null
}

export function demoPosts(): DemoPost[] {
  let cursor = 0
  return demoPostBodies.map((body, index) => {
    while (cursor < categories.length - 1) {
      const end = categories.slice(0, cursor + 1).reduce((sum, item) => sum + item.count, 0)
      if (index < end) break
      cursor += 1
    }
    const category = categories[cursor] ?? categories[0]
    const link = body.match(/https:\/\/\S+/)?.[0] ?? null
    const communitySlug = category.community && index % 2 === 0 ? category.community : null
    return {
      category: category.name,
      author: demoPeople[index % demoPeople.length]?.username ?? 'mira_ell',
      body,
      communitySlug,
      linkUrl: link,
      quoteOf: quoteOf[index] ?? null,
      poll: polls[index] ?? null,
    }
  })
}

const commentFrames = [
  (line: string) => `I read "${line}" The useful part is the constraint, not the slogan.`,
  (line: string) => `Replying to "${line}" I would try that with a small room first.`,
  (line: string) => `"${line}" matches what I see when I read the thread slowly.`,
  (line: string) => `If "${line}" is the goal, what do we leave off the screen?`,
  (line: string) => `I disagree a little with "${line}" I would put the caveat in the same post.`,
  (line: string) => `Saving this because "${line}" is the kind of note I want to find later.`,
  (line: string) => `From the builder side, "${line}" needs one example before I trust it.`,
  (line: string) => `I showed "${line}" to a friend who has never opened a wallet. They followed it.`,
  (line: string) => `The community version of "${line}" should live under a rule.`,
  (line: string) => `"${line}" is enough. I am not adding a number to it.`,
  (line: string) => `After a second read, "${line}" still holds.`,
  (line: string) => `I would quote "${line}" and add only the step I actually tried.`,
]

export type DemoComment = {
  postIndex: number
  author: string
  body: string
  parentSlot: number | null
}

function commentSlots(postIndex: number): number {
  if (postIndex < 20) return 4
  if (postIndex < 60) return 3
  if (postIndex < 100) return 2
  return 1
}

export function demoComments(): DemoComment[] {
  const posts = demoPosts()
  const comments: DemoComment[] = []
  posts.forEach((post, postIndex) => {
    const slots = commentSlots(postIndex)
    const line = post.body.split(/(?<=\.)\s/)[0] ?? post.body
    for (let slot = 0; slot < slots; slot += 1) {
      let authorIndex = (postIndex + slot + 1) % demoPeople.length
      if (demoPeople[authorIndex]?.username === post.author) authorIndex = (authorIndex + 1) % demoPeople.length
      const frame = commentFrames[(postIndex + slot) % commentFrames.length] ?? ((value: string) => value)
      comments.push({
        postIndex,
        author: demoPeople[authorIndex]?.username ?? 'nico_vale',
        body: frame(line),
        parentSlot: slots >= 3 && slot === slots - 1 ? 0 : null,
      })
    }
  })
  return comments
}

export type Pair = { postIndex: number; userIndex: number }

function budget(postIndex: number, kind: 'like' | 'repost' | 'bookmark'): number {
  if (kind === 'like') {
    if (postIndex < 20) return 6
    if (postIndex < 40) return 3
    if (postIndex < 60) return 1
    return 0
  }
  if (kind === 'repost') {
    if (postIndex < 20) return 2
    if (postIndex < 60) return 1
    return 0
  }
  return postIndex < 40 ? 1 : 0
}

function plannedPairs(kind: 'like' | 'repost' | 'bookmark', avoidAuthor: boolean): Pair[] {
  const posts = demoPosts()
  const rows: Pair[] = []
  const seen = new Set<string>()
  for (let postIndex = 0; postIndex < posts.length; postIndex += 1) {
    const author = posts[postIndex]?.author
    let placed = 0
    let userIndex = (postIndex * 3) % demoPeople.length
    while (placed < budget(postIndex, kind)) {
      const person = demoPeople[userIndex]
      userIndex = (userIndex + 1) % demoPeople.length
      if (!person) break
      if (avoidAuthor && person.username === author) continue
      const key = `${postIndex}:${person.username}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ postIndex, userIndex: demoPeople.indexOf(person) })
      placed += 1
      if (userIndex === (postIndex * 3) % demoPeople.length) break
    }
  }
  return rows
}

export function demoLikes(): Pair[] {
  return plannedPairs('like', false)
}

export function demoReposts(): Pair[] {
  return plannedPairs('repost', true)
}

export function demoBookmarks(): Pair[] {
  return plannedPairs('bookmark', false)
}

export function demoFollows(): Array<{ follower: string; followee: string }> {
  const rows: Array<{ follower: string; followee: string }> = []
  const seen = new Set<string>()
  for (const step of [1, 4, 9]) {
    for (let index = 0; index < demoPeople.length && rows.length < 60; index += 1) {
      const follower = demoPeople[index]
      const followee = demoPeople[(index + step) % demoPeople.length]
      if (!follower || !followee || follower.username === followee.username) continue
      const key = `${follower.username}:${followee.username}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ follower: follower.username, followee: followee.username })
    }
  }
  return rows
}

export function demoMemberships(): Array<{ slug: string; username: string; role: 'owner' | 'moderator' | 'member' }> {
  const rows: Array<{ slug: string; username: string; role: 'owner' | 'moderator' | 'member' }> = []
  for (const [index, community] of demoCommunities.entries()) {
    rows.push({ slug: community.slug, username: community.owner, role: 'owner' })
    const ownerIndex = demoPeople.findIndex((person) => person.username === community.owner)
    for (const offset of [2, 5]) {
      const person = demoPeople[(ownerIndex + offset) % demoPeople.length]
      if (!person) continue
      rows.push({
        slug: community.slug,
        username: person.username,
        role: offset === 5 && index % 3 === 0 ? 'moderator' : 'member',
      })
    }
  }
  return rows
}

export function demoVotes(): Array<{ postIndex: number; userIndex: number; optionIndex: number }> {
  const votes: Array<{ postIndex: number; userIndex: number; optionIndex: number }> = []
  demoPosts().forEach((post, postIndex) => {
    if (!post.poll) return
    for (let slot = 0; slot < 3; slot += 1) {
      votes.push({
        postIndex,
        userIndex: (postIndex + slot + 2) % demoPeople.length,
        optionIndex: slot % post.poll.options.length,
      })
    }
  })
  return votes
}

export function tagsIn(body: string): string[] {
  return [
    ...new Set(
      [...body.matchAll(/#([a-zA-Z0-9_]{2,32})/g)]
        .map((match) => match[1]?.toLowerCase())
        .filter((tag): tag is string => Boolean(tag)),
    ),
  ].slice(0, 8)
}

export function mentionsIn(body: string): string[] {
  return [
    ...new Set(
      [...body.matchAll(/@([a-z0-9_]{3,20})/g)]
        .map((match) => match[1]?.toLowerCase())
        .filter((name): name is string => Boolean(name)),
    ),
  ].slice(0, 8)
}

export function demoPlan() {
  const posts = demoPosts()
  const tags = new Set(posts.flatMap((post) => tagsIn(post.body)))
  return {
    batch: DEMO_BATCH,
    users: demoPeople.length,
    posts: posts.length,
    comments: demoComments().length,
    likes: demoLikes().length,
    reposts: demoReposts().length,
    bookmarks: demoBookmarks().length,
    follows: demoFollows().length,
    communities: demoCommunities.length,
    memberships: demoMemberships().length,
    polls: posts.filter((post) => post.poll).length,
    votes: demoVotes().length,
    hashtags: tags.size,
    quotes: posts.filter((post) => post.quoteOf !== null).length,
    links: posts.filter((post) => post.linkUrl).length,
    categories: categories.map((category) => ({ name: category.name, count: category.count })),
  }
}

const forbidden = /airdrop|token price|yield|staking|seed round|partnership with|we raised|audit passed|mainnet launch|token launch/i

export function assertDemoFixture(): void {
  const posts = demoPosts()
  const plan = demoPlan()
  if (plan.users < 25) throw new Error('Demo fixture needs at least 25 profiles')
  if (plan.posts !== 120) throw new Error(`Demo fixture expected 120 posts, found ${plan.posts}`)
  if (plan.comments < 300) throw new Error(`Demo fixture expected at least 300 comments, found ${plan.comments}`)
  if (plan.follows !== 60 || plan.memberships !== 30 || plan.polls !== 10 || plan.votes !== 30) {
    throw new Error('Demo fixture relationship counts do not match the plan')
  }
  if (plan.hashtags < 15) throw new Error('Demo fixture needs at least 15 hashtags')
  if (new Set(posts.map((post) => post.body)).size !== posts.length) throw new Error('Demo posts are not unique')
  for (const person of demoPeople) {
    if (person.bio.length > 280) throw new Error(`Demo bio is too long for ${person.username}`)
    if (!person.bio.includes('Fictional demo profile')) throw new Error(`Demo bio is not marked for ${person.username}`)
  }
  for (const [index, post] of posts.entries()) {
    if (post.body.length > 2000) throw new Error(`Demo post ${index} is too long`)
    if (forbidden.test(post.body)) throw new Error(`Demo post ${index} makes a forbidden claim`)
    if (post.quoteOf !== null && post.quoteOf >= index) throw new Error(`Demo quote ${index} does not point backward`)
  }
  for (const comment of demoComments()) {
    if (comment.body.length > 1000) throw new Error('Demo comment is too long')
    if (comment.author === posts[comment.postIndex]?.author && comment.parentSlot === null) {
      throw new Error('A top-level demo comment reused the post author unexpectedly')
    }
  }
  for (const follow of demoFollows()) {
    if (follow.follower === follow.followee) throw new Error('Demo follow points at the same person')
  }
}
