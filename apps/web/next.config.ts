import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@temporalio/client'],
};

export default nextConfig;
