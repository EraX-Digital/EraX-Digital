const LOCAL_API = 'http://127.0.0.1:4000'

function onVercel(): boolean {
  return (
    process.env.VERCEL === '1' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview'
  )
}

export function publicApiUrl(source = process.env.NEXT_PUBLIC_API_URL): string {
  const configured = source?.trim() ?? ''
  if (configured) {
    if (onVercel() && (!configured.startsWith('https://') || /localhost|127\.0\.0\.1/i.test(configured))) {
      throw new Error(
        'NEXT_PUBLIC_API_URL must be an https URL for Vercel builds. Do not put database URLs, passwords, or API keys in NEXT_PUBLIC_ variables.',
      )
    }
    return configured
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return LOCAL_API
    return window.location.origin
  }
  const vercelHost = process.env.VERCEL_URL?.trim()
  if (vercelHost) return `https://${vercelHost}`
  return LOCAL_API
}
