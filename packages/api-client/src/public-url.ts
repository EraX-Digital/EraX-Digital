export function publicApiUrl(source = process.env.NEXT_PUBLIC_API_URL): string {
  const deployment = process.env.VERCEL_ENV
  if (deployment === 'production' || deployment === 'preview') {
    if (!source?.startsWith('https://') || /localhost|127\.0\.0\.1/i.test(source)) {
      throw new Error(
        'NEXT_PUBLIC_API_URL must be an https URL for Vercel preview and production builds. Do not put database URLs, passwords, or API keys in NEXT_PUBLIC_ variables.',
      )
    }
  }
  return source && source.length > 0 ? source : 'http://127.0.0.1:4000'
}
