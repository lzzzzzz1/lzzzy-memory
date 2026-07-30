import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "我们的地图",
  description: "两个人的私密旅行记忆原型",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#11243a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
