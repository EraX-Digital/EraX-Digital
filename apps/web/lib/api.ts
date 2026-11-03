import { createApiClient } from '@erax/api-client'

export const api = createApiClient(process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000')
