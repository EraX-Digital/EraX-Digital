const HASHTAG = /#([a-zA-Z0-9_]{2,32})/g
const MENTION = /@([a-z0-9_]{3,20})/g

export function cleanText(value: string, max: number): string {
  const cleaned = value.replaceAll('\u0000', '').replace(/\r\n/g, '\n').trim()
  if (cleaned.length > max) {
    throw new Error(`text_too_long:${max}`)
  }
  return cleaned
}

export function extractHashtags(value: string): string[] {
  return [...new Set([...value.matchAll(HASHTAG)].map((match) => match[1]?.toLowerCase()).filter(Boolean))].slice(0, 8) as string[]
}

export function extractMentions(value: string): string[] {
  return [...new Set([...value.matchAll(MENTION)].map((match) => match[1]?.toLowerCase()).filter(Boolean))].slice(0, 8) as string[]
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export function httpUrl(value: string, max = 500): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('invalid_url')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('invalid_url')
  if (url.toString().length > max) throw new Error('invalid_url')
  return url.toString()
}
