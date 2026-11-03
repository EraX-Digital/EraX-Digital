import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@erax/ui', '@erax/api-client', '@erax/shared-types'],
}

export default nextConfig
