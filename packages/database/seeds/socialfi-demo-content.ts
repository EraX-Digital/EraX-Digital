export const DEMO_BATCH = 'socialfi-demo-2026-11'
export const DEMO_PASSWORD = 'local-demo-pass-1'

export type DemoPerson = {
  username: string
  displayName: string
  location: string
  bio: string
  creator: boolean
  website: string
}

const note = 'Demo profile. Fictional person created for local and staging fixtures. Not a customer.'

export const demoPeople: DemoPerson[] = [
  {
    username: 'mira_ell',
    displayName: 'Mira Ell',
    location: 'Lisbon',
    creator: true,
    website: 'https://example.com/mira-ell',
    bio: `${note} Self-declared creator in this fixture. Not an on-chain registration.`,
  },
  {
    username: 'nico_vale',
    displayName: 'Nico Vale',
    location: 'Turin',
    creator: false,
    website: 'https://example.com/nico-vale',
    bio: `${note} Writes short notes about making things in public.`,
  },
  {
    username: 'sena_oka',
    displayName: 'Sena Oka',
    location: 'Osaka',
    creator: false,
    website: 'https://example.com/sena-oka',
    bio: `${note} Keeps a quiet log of walks and workshops.`,
  },
  {
    username: 'idris_holm',
    displayName: 'Idris Holm',
    location: 'Malmo',
    creator: true,
    website: 'https://example.com/idris-holm',
    bio: `${note} Self-declared creator in this fixture. Not an on-chain registration.`,
  },
  {
    username: 'leah_quist',
    displayName: 'Leah Quist',
    location: 'Accra',
    creator: false,
    website: 'https://example.com/leah-quist',
    bio: `${note} Asks practical questions about communities.`,
  },
  {
    username: 'omar_seid',
    displayName: 'Omar Seid',
    location: 'Amman',
    creator: false,
    website: 'https://example.com/omar-seid',
    bio: `${note} Talks about wallets as optional tools.`,
  },
  {
    username: 'pia_nord',
    displayName: 'Pia Nord',
    location: 'Bergen',
    creator: false,
    website: 'https://example.com/pia-nord',
    bio: `${note} Describes interfaces without collecting anyone else's posts.`,
  },
  {
    username: 'theo_marsh',
    displayName: 'Theo Marsh',
    location: 'Bristol',
    creator: true,
    website: 'https://example.com/theo-marsh',
    bio: `${note} Self-declared creator in this fixture. Not an on-chain registration.`,
  },
]

export const demoCommunities = [
  {
    slug: 'field-notes',
    name: 'Field Notes',
    description: 'A fictional EraX community for short public notes. Demo fixture.',
    rules: 'Be specific. Do not post someone else’s private messages. This community is demo content.',
  },
  {
    slug: 'studio-hours',
    name: 'Studio Hours',
    description: 'Fictional studio check-ins. Demo fixture.',
    rules: 'One update at a time. No payment requests. This community is demo content.',
  },
  {
    slug: 'quiet-web',
    name: 'Quiet Web',
    description: 'Fictional discussion of calmer interfaces. Demo fixture.',
    rules: 'Describe what you built. Do not scrape or repost other networks. Demo content.',
  },
  {
    slug: 'base-table',
    name: 'Base Table',
    description: 'Fictional notes about using Base as a network. No prices. Demo fixture.',
    rules: 'No price talk, no yield claims, and no token promotions. Demo content.',
  },
]

const topics = [
  (detail: string) =>
    `I published this note so it stays with my name. Today I wrote about ${detail}, and I want the draft attached to this profile rather than a feed I do not control.`,
  (detail: string) =>
    `Our community thread is still small. I am using it to compare notes on ${detail} without turning the conversation into a scoreboard.`,
  (detail: string) =>
    `Ethereum is the network this project treats as the settlement home. I am learning how ${detail} fits that, and I am not quoting a price.`,
  (detail: string) =>
    `Base is the first Layer 2 we talk about for everyday use. My note today is about ${detail}. This note does not set a reward rate or a fee schedule.`,
  (detail: string) =>
    `I am trying to keep the interface quiet. The piece I am designing is ${detail}, with one action on the screen and room to read.`,
  (detail: string) =>
    `Walked past ${detail} and wrote it down before I forgot the order of the street. This is a fictional place note for the demo.`,
  (detail: string) =>
    `Caption without a picture: ${detail}. I am not uploading a file in this fixture because storage may be unavailable.`,
  (detail: string) =>
    `Question for the room: how would you explain ${detail} to a friend who has an account here and has never opened a wallet?`,
  (detail: string) =>
    `Creator work, for me, starts as a public draft. I am practicing ${detail}. This profile is self-declared only. Nothing here is paid or on-chain.`,
  (detail: string) =>
    `A wallet is optional on EraX Social. I can talk about ${detail} and still post, follow, and reply with the email account alone.`,
]

const details = [
  'a paper notebook left on the studio table',
  'the way a community names its own rules',
  'a signature that proves an address without revealing a key',
  'a cover image that never pretends to upload when storage is off',
  'a short reply that answers one question',
  'a map of a harbor that exists only in this story',
  'the difference between a repost and a quote',
  'keeping likes private to the person who made them',
  'writing a biography that fits in one breath',
  'a follow list that shows mutual people when the data is real',
]

const tags = ['#fieldnotes', '#eraxsocial', '#quietweb', '#basetable']

export type DemoPost = {
  author: string
  body: string
  communitySlug: string | null
}

export function demoPosts(): DemoPost[] {
  const posts: DemoPost[] = []
  for (let index = 0; index < 100; index += 1) {
    const topic = topics[index % topics.length] ?? topics[0]!
    const detail = details[Math.floor(index / 10)] ?? details[0]!
    const author = demoPeople[index % demoPeople.length]?.username ?? 'mira_ell'
    const mention = demoPeople[(index + 3) % demoPeople.length]?.username
    const community = index % 5 === 0 ? (demoCommunities[index % demoCommunities.length]?.slug ?? null) : null
    const tag = index % 4 === 0 ? ` ${tags[index % tags.length]}` : ''
    const call = mention && index % 6 === 0 ? ` @${mention}` : ''
    const line = topic(detail ?? 'a public note')
    posts.push({
      author,
      communitySlug: community,
      body: `${line}${call}${tag} Demo note ${String(index + 1).padStart(3, '0')}.`,
    })
  }
  return posts
}

export const demoComments = demoPosts()
  .slice(0, 20)
  .map((post, index) => ({
    postIndex: index,
    author: demoPeople[(index + 1) % demoPeople.length]?.username ?? 'nico_vale',
    body: `Replying on the demo thread: I read note ${String(index + 1).padStart(3, '0')} and I am keeping my answer short.`,
    source: post.author,
  }))
