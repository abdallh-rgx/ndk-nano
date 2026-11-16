import { Binary, ExternalLink } from "lucide-react";
import { GH_REPO_URL } from "@/lib/gh";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950">
            <Binary className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold text-zinc-200">
              ndk-nano — مشروع مفتوح المصدر
            </p>
            <p className="text-xs text-zinc-500">رخصة MIT</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-zinc-500">
          <span>بُني بـ Next.js و Z3</span>
          <a
            href={GH_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-zinc-400 transition-colors hover:text-emerald-400"
            aria-label="المستودع على GitHub"
          >
            GitHub
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
