"use client";

import { useEffect, useState } from "react";
import { Binary, CheckCircle2, CircleDashed, Github, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGhStatus } from "@/hooks/use-gh-status";
import { ACTIONS_BADGE, GH_REPO_URL } from "@/lib/gh";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#idea", label: "الفكرة" },
  { href: "#pipeline", label: "خط الإنتاج" },
  { href: "#assembly", label: "Assembly" },
  { href: "#z3", label: "Z3" },
  { href: "#results", label: "النتائج" },
];

function CiChip() {
  const { data, loading } = useGhStatus();

  const run = data?.latest_run ?? null;
  let cls = "border-zinc-800 bg-zinc-900/80 text-zinc-400";
  let label = "CI";
  let icon = <CircleDashed className="size-3.5" aria-hidden="true" />;

  if (loading) {
    cls = "border-zinc-800 bg-zinc-900/80 text-zinc-400";
    label = "CI";
    icon = <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />;
  } else if (run) {
    if (run.status === "completed") {
      if (run.conclusion === "success") {
        cls = "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
        label = "CI: نجاح";
        icon = <CheckCircle2 className="size-3.5" aria-hidden="true" />;
      } else {
        cls = "border-rose-500/40 bg-rose-500/10 text-rose-400";
        label = "CI: فشل";
        icon = <XCircle className="size-3.5" aria-hidden="true" />;
      }
    } else {
      cls = "border-amber-400/40 bg-amber-400/10 text-amber-400";
      label = "CI: قيد التشغيل";
      icon = <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />;
    }
  }

  const content = (
    <span
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
        cls
      )}
      aria-label={`حالة GitHub Actions: ${label}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </span>
  );

  if (run?.html_url) {
    return (
      <a
        href={run.html_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center"
        aria-label="آخر تشغيل لـ GitHub Actions"
      >
        {content}
      </a>
    );
  }
  return <span className="inline-flex min-h-[44px] items-center">{content}</span>;
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60",
        scrolled && "shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
      )}
    >
      <nav
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6"
        aria-label="التنقل الرئيسي"
      >
        {/* Logo (right side in RTL) */}
        <a
          href="#idea"
          className="flex min-h-[44px] items-center gap-2.5"
          aria-label="ndk-nano — العودة إلى الأعلى"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950">
            <Binary className="size-5" aria-hidden="true" />
          </span>
          <span className="font-mono text-lg font-bold tracking-tight text-zinc-100" dir="ltr">
            ndk-nano
          </span>
        </a>

        {/* Middle links */}
        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="inline-flex h-10 items-center rounded-md px-3 text-sm text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
              >
                {link.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href={GH_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center rounded-md px-3 text-sm text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
            >
              المستودع
            </a>
          </li>
        </ul>

        {/* Left actions */}
        <div className="flex items-center gap-2">
          <CiChip />
          <Button
            asChild
            variant="outline"
            className="h-11 min-w-[44px] border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50"
          >
            <a
              href={GH_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="المستودع على GitHub"
            >
              <Github className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </Button>
        </div>
      </nav>
      {/* Screen-reader-only reference to the CI badge image */}
      <span className="sr-only">
        شارة حالة الـ pipeline: {ACTIONS_BADGE}
      </span>
    </header>
  );
}
