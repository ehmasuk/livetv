import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import type { ReactNode } from "react"

import "./globals.css"
import { PwaRegistrar } from "@/components/pwa-register"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
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
    default: `${APP_NAME} — Live TV Streams`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  openGraph: {
    siteName: APP_NAME,
    title: `${APP_NAME} — Live TV Streams`,
    description: APP_DESCRIPTION,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: `${APP_NAME} — Live TV Streams`,
    description: APP_DESCRIPTION,
  },
  icons: {
    icon: "/img/3dplay.png",
    apple: "/img/3dplay.png",
  },
}

/** Notch and home-indicator aware, installed-app friendly. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ef4444",
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
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <PwaRegistrar />
      </body>
    </html>
  )
}
