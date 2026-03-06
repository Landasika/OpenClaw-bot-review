import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "./sidebar";
import { AlertMonitor } from "./alert-monitor";
import { GlobalBugsOverlay } from "./global-bugs-overlay";
import { initTaskAutomation } from "./task-scheduler-init";

// 在服务端启动任务调度器
if (typeof window === "undefined") {
  initTaskAutomation();
}

export const metadata: Metadata = {
  title: "OpenClaw Bot Dashboard",
  description: "查看所有 OpenClaw 机器人配置",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="app-body">
        <div className="app-chrome-bg" aria-hidden="true">
          <span className="app-orb app-orb-a" />
          <span className="app-orb app-orb-b" />
          <span className="app-beam app-beam-a" />
          <span className="app-beam app-beam-b" />
          <span className="app-grid" />
          <span className="app-noise" />
          <span className="app-scanline" />
        </div>

        <Providers>
          <AlertMonitor />
          <GlobalBugsOverlay />
          <div className="app-frame min-h-screen md:flex">
            <Sidebar />
            <main className="app-main flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
