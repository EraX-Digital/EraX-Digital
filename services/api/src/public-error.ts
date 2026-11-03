const connectionSecret =
  /postgres(?:ql)?:\/\/\S+|rediss?:\/\/\S+|(?:password|secret|access[_-]?key)\s*[:=]\s*\S+/i

export function publicCheckDetail(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  if (!message || connectionSecret.test(message)) return fallback
  return message.slice(0, 180)
}
