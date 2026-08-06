import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // 모노레포 패키지를 소스 그대로 가져다 쓴다 (빌드 단계 없음)
  transpilePackages: ['@retro/types', '@retro/room-kit'],
  typescript: { ignoreBuildErrors: false },
}

export default config
