import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.ERAX_VERCEL_ROOT === '1' ? '../../.next' : '.next',
  outputFileTracingRoot: path.join(appDirectory, '../..'),
  transpilePackages: ['@erax/ui', '@erax/api-client', '@erax/shared-types'],
  turbopack: {
    resolveAlias: {
      fs: { browser: './lib/empty-module.ts' },
      net: { browser: './lib/empty-module.ts' },
      tls: { browser: './lib/empty-module.ts' },
    },
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false }
    return config
  },
}

export default nextConfig
