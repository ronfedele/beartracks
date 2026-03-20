import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bear Tracks | OMS Pass System',
  description: 'Student sign-out pass management system',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
