import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import type { ReactNode } from "react"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants"
import { cn } from "@/lib/utils"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Live Sports Streams`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", inter.variable, geistMono.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
