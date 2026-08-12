import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "我们的地图",
  description: "两个人的私密旅行记忆空间",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = { themeColor: "#11243a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
