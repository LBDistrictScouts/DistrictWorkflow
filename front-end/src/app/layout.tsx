import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import Navigation from "@/components/navigation";
import Footer from "@/components/footer";
import "./globals.css";

const nunitoSans = localFont({
  src: "../../public/fonts/nunito-sans-latin.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "District Workflow | LBA Scouts", template: "%s | District Workflow" },
  description: "A home for district workflows at Letchworth, Baldock & Ashwell Scouts.",
  icons: { icon: "/favicon.svg" },
};

const themeScript = `try{const t=localStorage.getItem('district-workflow-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch{}`;
const mainContentId = "main";

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en-GB" suppressHydrationWarning>
    <body className={nunitoSans.className}>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <a className="skip-link" href={`#${mainContentId}`}>Skip to content</a>
      <Navigation />
      <main id={mainContentId} tabIndex={-1}>{children}</main>
      <Footer />
    </body>
  </html>;
}
