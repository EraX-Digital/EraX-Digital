import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(appDirectory, '../..'),
  transpilePackages: ['@erax/ui', '@erax/api-client', '@erax/shared-types'],
}

export default nextConfig
