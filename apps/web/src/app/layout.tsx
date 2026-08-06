import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '손이심심 — 그때 그 시절 실시간 퀴즈',
  description: '손이 심심할 때 들어와서 채팅으로 답을 외치는 실시간 방 게임. 삐삐부터 스타크래프트까지.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F8FA' },
    { media: '(prefers-color-scheme: dark)', color: '#0D0F14' },
  ],
  // 채팅이 입력 장치인 게임이라 확대로 입력창이 밀리면 안 된다
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
