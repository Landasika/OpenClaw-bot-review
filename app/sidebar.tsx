"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n, LanguageSwitcher } from "@/lib/i18n";
import { ThemeSwitcher } from "@/lib/theme";

const BUGS_ENABLED_KEY = "pixel-office-bugs-enabled";

const NAV_ITEMS = [
  {
    group: "nav.overview",
    items: [
      { href: "/", icon: "🤖", labelKey: "nav.agents" },
      { href: "/pixel-office", icon: "🎮", labelKey: "nav.pixelOffice" },
      { href: "/models", icon: "🧠", labelKey: "nav.models" },
    ],
  },
  {
    group: "nav.monitor",
    items: [
      { href: "/sessions", icon: "💬", labelKey: "nav.sessions" },
      { href: "/stats", icon: "📊", labelKey: "nav.stats" },
      { href: "/alerts", icon: "🔔", labelKey: "nav.alerts" },
    ],
  },
  {
    group: "nav.tasks",
    items: [
      { href: "/tasks", icon: "📋", labelKey: "nav.taskManagement" },
      { href: "/epics", icon: "🎯", labelKey: "nav.epicManagement" },
      { href: "/meetings", icon: "🗂️", labelKey: "nav.meetings" },
      { href: "/meeting-settings", icon: "🗓️", labelKey: "nav.meetingSettings" },
    ],
  },
  {
    group: "nav.config",
    items: [
      { href: "/system-config", icon: "⚙️", labelKey: "nav.systemConfig" },
      { href: "/skills", icon: "🧩", labelKey: "nav.skills" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileAgentCount, setMobileAgentCount] = useState<number | null>(null);
  const [bugsEnabled, setBugsEnabled] = useState(false);
  const [logoCarry, setLogoCarry] = useState<{ active: boolean; dx: number; dy: number; angle: number; hidden: boolean }>({
    active: false,
    dx: 0,
    dy: 0,
    angle: 0,
    hidden: false,
  });
  const [manualLogoOffset, setManualLogoOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [manualLogoAngle, setManualLogoAngle] = useState(0);
  const [isLogoDragging, setIsLogoDragging] = useState(false);
  const bugsEnabledRef = useRef(false);
  const suppressLogoClickRef = useRef(false);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; originDx: number; originDy: number; moved: boolean; lastX: number; lastY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    originDx: 0,
    originDy: 0,
    moved: false,
    lastX: 0,
    lastY: 0,
  });

  useEffect(() => {
    const onStart = () => setLogoCarry((s) => ({ ...s, active: true, hidden: false }));
    const onStop = () => setLogoCarry({ active: false, dx: 0, dy: 0, angle: 0, hidden: false });
    const onProgress = (e: Event) => {
      if (dragRef.current.active) return;
      const ce = e as CustomEvent<{ active: boolean; dx: number; dy: number; angle: number; hidden: boolean }>;
      const d = ce.detail;
      if (!d) return;
      setLogoCarry({ active: !!d.active, dx: d.dx || 0, dy: d.dy || 0, angle: d.angle || 0, hidden: !!d.hidden });
    };
    window.addEventListener("openclaw-logo-drag-start", onStart as EventListener);
    window.addEventListener("openclaw-logo-drag-stop", onStop as EventListener);
    window.addEventListener("openclaw-logo-carry-progress", onProgress as EventListener);
    return () => {
      window.removeEventListener("openclaw-logo-drag-start", onStart as EventListener);
      window.removeEventListener("openclaw-logo-drag-stop", onStop as EventListener);
      window.removeEventListener("openclaw-logo-carry-progress", onProgress as EventListener);
    };
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      const enabled = localStorage.getItem(BUGS_ENABLED_KEY) === "true";
      bugsEnabledRef.current = enabled;
      setBugsEnabled(enabled);
    };
    syncFromStorage();
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("openclaw-bugs-config-change", syncFromStorage as EventListener);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("openclaw-bugs-config-change", syncFromStorage as EventListener);
    };
  }, []);

  useEffect(() => {
    const stopDrag = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      if (dragRef.current.moved) suppressLogoClickRef.current = true;
      setIsLogoDragging(false);
      document.body.style.userSelect = "";
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      if (bugsEnabledRef.current) {
        stopDrag();
        return;
      }
      const nextDx = dragRef.current.originDx + (e.clientX - dragRef.current.startX);
      const nextDy = dragRef.current.originDy + (e.clientY - dragRef.current.startY);
      if (Math.abs(nextDx - dragRef.current.originDx) > 3 || Math.abs(nextDy - dragRef.current.originDy) > 3) {
        dragRef.current.moved = true;
      }
      const moveX = e.clientX - dragRef.current.lastX;
      const moveY = e.clientY - dragRef.current.lastY;
      if (Math.abs(moveX) + Math.abs(moveY) > 0.2) {
        const targetAngle = Math.max(-0.95, Math.min(0.95, Math.atan2(moveY, moveX) * 0.65));
        setManualLogoAngle((prev) => prev * 0.65 + targetAngle * 0.35);
      }
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      setManualLogoOffset({ dx: nextDx, dy: nextDy });
    };
    const onMouseUp = () => stopDrag();
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
    };
  }, []);

  const handleLogoMouseDown = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (e.button !== 0 || bugsEnabledRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originDx: manualLogoOffset.dx,
      originDy: manualLogoOffset.dy,
      moved: false,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    setIsLogoDragging(true);
    document.body.style.userSelect = "none";
  };

  const handleLogoClickCapture = (e: React.MouseEvent<HTMLElement>) => {
    if (!suppressLogoClickRef.current) return;
    suppressLogoClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleLogoNativeDragStart = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
  };

  const logoTransform = `translate(${manualLogoOffset.dx + logoCarry.dx}px, ${manualLogoOffset.dy + logoCarry.dy}px) rotate(${logoCarry.angle + manualLogoAngle}rad)`;
  const mobileLogoTransform = `translate(${logoCarry.dx}px, ${logoCarry.dy}px) rotate(${logoCarry.angle}rad)`;
  const logoCursor = !bugsEnabled ? (isLogoDragging ? "grabbing" : "grab") : "default";
  const mobileCurrent = NAV_ITEMS.flatMap((g) => g.items).find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    let aborted = false;
    const fetchAgentCount = async () => {
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (aborted) return;
        const count = Array.isArray(data?.agents) ? data.agents.length : 0;
        setMobileAgentCount(count);
      } catch {}
    };
    if (pathname === "/") {
      void fetchAgentCount();
      const timer = setInterval(fetchAgentCount, 30000);
      return () => {
        aborted = true;
        clearInterval(timer);
      };
    }
    return () => {
      aborted = true;
    };
  }, [pathname]);

  return (
    <>
      <div className="md:hidden">
        <header className="fixed inset-x-0 top-0 z-50 h-14 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
          <div className="h-full px-3 flex items-center justify-between gap-2">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="w-9 h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-base"
              aria-label="Open menu"
            >
              ☰
            </button>
            <Link
              href="/"
              className="flex items-center gap-2 min-w-0"
              onClickCapture={handleLogoClickCapture}
              onDragStart={handleLogoNativeDragStart}
              draggable={false}
            >
              <span
                className="relative inline-block leading-none transition-opacity duration-300"
                data-openclaw-logo-anchor="true"
                onDragStart={handleLogoNativeDragStart}
                draggable={false}
                style={{
                  fontSize: "1.875rem",
                  transform: mobileLogoTransform,
                  transformOrigin: "50% 50%",
                  opacity: logoCarry.hidden ? 0 : 1,
                }}
              >
                🦞
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold tracking-wide truncate">OPENCLAW</div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">
                  {pathname === "/" && mobileAgentCount !== null
                    ? `${mobileAgentCount} ${t("home.agentCount")}`
                    : mobileCurrent ? t(mobileCurrent.labelKey) : "BOT DASHBOARD"}
                </div>
              </div>
            </Link>
            <div className="flex items-center gap-1">
              <LanguageSwitcher />
              <ThemeSwitcher />
            </div>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-[55]">
            <button
              className="absolute inset-0 bg-black/45"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu overlay"
            />
            <aside className="absolute top-0 left-0 bottom-0 w-[276px] max-w-[86vw] border-r border-[var(--border)] bg-[var(--card)] shadow-2xl flex flex-col">
              <div className="h-14 px-3 border-b border-[var(--border)] flex items-center justify-between">
                <div className="font-semibold text-sm">Navigation</div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-8 h-8 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
                  aria-label="Close menu"
                >
                  ×
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3">
                <div className="space-y-4">
                  {NAV_ITEMS.map((group) => (
                    <div key={group.group}>
                      <div className="px-1 mb-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                        {t(group.group)}
                      </div>
                      <div className="space-y-1">
                        {group.items.map((item) => {
                          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                          return (
                            <div key={item.href}>
                              <Link
                                href={item.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className={`nav-item flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                                  active
                                    ? "nav-item-active bg-[var(--accent)]/15 text-[var(--accent)] font-medium"
                                    : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
                                }`}
                              >
                                <span className="text-base">{item.icon}</span>
                                {t(item.labelKey)}
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </nav>
            </aside>
          </div>
        )}
      </div>

      <aside
        className="sidebar hidden md:flex"
        style={{ width: collapsed ? 64 : 224 }}
      >
        {/* Header: Logo + Toggle */}
        <div className="border-b border-[var(--border)]" style={{ padding: collapsed ? "16px 0" : "16px 20px" }}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Link href="/" onClickCapture={handleLogoClickCapture} onDragStart={handleLogoNativeDragStart} draggable={false}>
                <span
                  className="relative inline-block transition-opacity duration-300"
                  onMouseDown={handleLogoMouseDown}
                  onDragStart={handleLogoNativeDragStart}
                  draggable={false}
                  style={{
                    fontSize: "4.219rem",
                    lineHeight: 1,
                    transform: logoTransform,
                    opacity: logoCarry.hidden ? 0 : 1,
                    cursor: logoCursor,
                  }}
                >
                  🦞
                </span>
              </Link>
              <button
                onClick={() => setCollapsed(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-lg"
                title={t("nav.expandSidebar")}
              >
                »
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <Link
                  href="/"
                  className="flex items-center gap-2"
                  onClickCapture={handleLogoClickCapture}
                  onDragStart={handleLogoNativeDragStart}
                  draggable={false}
                >
                  <span
                    className="relative inline-block transition-opacity duration-300"
                    onMouseDown={handleLogoMouseDown}
                    onDragStart={handleLogoNativeDragStart}
                    draggable={false}
                    style={{
                      fontSize: "4.219rem",
                      lineHeight: 1,
                      transform: logoTransform,
                      opacity: logoCarry.hidden ? 0 : 1,
                      cursor: logoCursor,
                    }}
                  >
                    🦞
                  </span>
                  <div>
                    <div className="text-sm font-bold text-[var(--text)] tracking-wide">OPENCLAW</div>
                    <div className="text-[10px] text-[var(--text-muted)] tracking-wider">BOT DASHBOARD</div>
                  </div>
                </Link>
                <button
                  onClick={() => setCollapsed(true)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-lg"
                  title={t("nav.collapseSidebar")}
                >
                  «
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2 pl-8">
                <LanguageSwitcher />
                <ThemeSwitcher />
              </div>
            </div>
          )}
        </div>

        {/* Nav groups */}
        <nav className="sidebar-nav" style={{ padding: collapsed ? "16px 8px" : "16px 12px" }}>
          <div className="space-y-5">
            {NAV_ITEMS.map((group) => (
              <div key={group.group}>
                {!collapsed && (
                  <div className="px-2 mb-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between">
                    {t(group.group)}
                    <span className="text-[var(--text-muted)] opacity-40">—</span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return (
                      <div key={item.href}>
                        <Link
                          href={item.href}
                          title={collapsed ? t(item.labelKey) : undefined}
                          className={`nav-item flex items-center rounded-lg text-sm transition-colors ${
                            active
                              ? "nav-item-active bg-[var(--accent)]/15 text-[var(--accent)] font-medium"
                              : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
                          }`}
                          style={{
                            padding: collapsed ? "8px 0" : "8px 12px",
                            justifyContent: collapsed ? "center" : "flex-start",
                            gap: collapsed ? 0 : 10,
                          }}
                        >
                          <span className="text-base">{item.icon}</span>
                          {!collapsed && t(item.labelKey)}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>
      </aside>

      {/* Spacer */}
      <div className="hidden md:block" style={{ width: collapsed ? 64 : 224, flexShrink: 0, transition: "width 0.2s" }} />
    </>
  );
}
