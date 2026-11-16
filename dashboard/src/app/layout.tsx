import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "ndk-nano | كسر حاجز الـ 3GB",
  description:
    "ndk-nano: تقليص حزمة Android NDK من 2.9GB إلى أقل من 300MB عبر تمثيل الـ headers في Assembly، وتصغير شجرة الملفات بمحرك Z3 SMT، وضغط حتمي بـ zstd/xz، مع loader يحاكي سلوك الـ NDK الأصلي.",
  keywords: [
    "ndk-nano",
    "Android NDK",
    "Z3",
    "SMT",
    "Assembly",
    "set-cover",
    "zstd",
    "xz",
    "toolchain",
  ],
  authors: [{ name: "abdallh-rgx" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "ndk-nano | كسر حاجز الـ 3GB",
    description:
      "Android NDK كامل تحت 300 ميغابايت: Assembly + Z3 + ضغط حتمي + loader يحاكي الـ NDK.",
    siteName: "ndk-nano",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-zinc-950 text-zinc-100">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
