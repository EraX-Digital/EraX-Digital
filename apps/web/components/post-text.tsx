import type { ReactNode } from 'react'

const TOKEN = /#([a-zA-Z0-9_]{2,32})|@([a-z0-9_]{3,20})/g

export function PostText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) parts.push(text.slice(last, index))
    if (match[1]) {
      parts.push(
        <a key={`${index}-tag`} href={`/app/search?q=${encodeURIComponent(match[1])}`}>
          #{match[1]}
        </a>,
      )
    } else if (match[2]) {
      parts.push(
        <a key={`${index}-name`} href={`/app/u/${match[2]}`}>
          @{match[2]}
        </a>,
      )
    }
    last = index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
