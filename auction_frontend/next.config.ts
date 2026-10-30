// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '4200', pathname: '/**' },
      { protocol: 'http', hostname: '127.0.0.1', port: '4200', pathname: '/**' },
    ],
  },
};

export default nextConfig;
