import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = 'https://thesubmitcheck.com';
const siteTitle = 'SubmitCheck | Get submission-ready';
const siteDescription = 'Find the right academic journal for your manuscript, close editorial gaps with AI-assisted review, and prepare a submission-ready paper — all in one workflow.';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'SubmitCheck',
  url: siteUrl,
  description: siteDescription,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: [
    { '@type': 'Offer', name: 'Free plan', price: '0', priceCurrency: 'INR' },
    { '@type': 'Offer', name: 'Per-manuscript check', price: '799', priceCurrency: 'INR' },
    { '@type': 'Offer', name: 'Author Pro subscription', price: '1999', priceCurrency: 'INR' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: '%s | SubmitCheck',
  },
  description: siteDescription,
  keywords: ['journal matching', 'manuscript submission', 'find a journal for my paper', 'manuscript gap analysis', 'academic publishing', 'journal recommender', 'submission readiness check'],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: 'SubmitCheck',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
        {children}
        <footer className="site-footer">
          <span>© {new Date().getFullYear()} SubmitCheck</span>
          <nav className="site-footer-links">
            <Link href="/terms">Terms and Conditions</Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}
