const PRODUCTION_API = 'https://api.erax.digital'

export function publicApiUrl(source = process.env.NEXT_PUBLIC_API_URL): string {
  const configured = source?.trim() ?? ''
  const onVercel =
    process.env.VERCEL === '1' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview'
  if (!configured) return PRODUCTION_API
  if (
    onVercel &&
    (!configured.startsWith('https://') || /localhost|127\.0\.0\.1/i.test(configured))
  ) {
    throw new Error(
      'NEXT_PUBLIC_API_URL must be an https URL for Vercel builds. Do not put database URLs, passwords, or API keys in NEXT_PUBLIC_ variables.',
    )
  }
  return configured
}
