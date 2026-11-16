import { NextRequest, NextResponse } from "next/server";
import { GH_REPO } from "@/lib/gh";
import * as fs from "fs";
import * as path from "path";

export const revalidate = 120;

const GH_API = "https://api.github.com";
const TIMEOUT_MS = 8000;

interface GhRepoInfo {
  stars: number;
  html_url: string;
  pushed_at: string;
}

interface GhRunInfo {
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  head_sha: string;
}

interface GhReleaseInfo {
  tag: string;
  asset_name: string | null;
  asset_mb: number | null;
  html_url: string;
}

export async function GET(_request: NextRequest) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ndk-nano-dashboard",
  };

  const fetchJson = async (url: string): Promise<unknown | null> => {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        next: { revalidate: 120 },
      });
      if (!res.ok) return null;
      return (await res.json()) as unknown;
    } catch {
      return null;
    }
  };

  const [repoJson, runsJson, releaseJson, releasesListJson] = await Promise.all([
    fetchJson(`${GH_API}/repos/${GH_REPO}`),
    fetchJson(`${GH_API}/repos/${GH_REPO}/actions/runs?per_page=1`),
    fetchJson(`${GH_API}/repos/${GH_REPO}/releases/latest`),
    // /releases/latest excludes prereleases; the pipeline publishes nightly
    // prereleases, so fall back to the newest entry of the list endpoint.
    fetchJson(`${GH_API}/repos/${GH_REPO}/releases?per_page=1`),
  ]);

  const repoData = repoJson as
    | { stargazers_count?: number; html_url?: string; pushed_at?: string }
    | null;
  const runsData = runsJson as { workflow_runs?: unknown[] } | null;
  const runData = (runsData?.workflow_runs?.[0] ?? null) as
    | {
        status?: string;
        conclusion?: string | null;
        html_url?: string;
        created_at?: string;
        head_sha?: string;
      }
    | null;
  const releaseData = (releaseJson ?? (releasesListJson as unknown[] | null)?.[0] ?? null) as
    | {
        tag_name?: string;
        html_url?: string;
        assets?: { name?: string; size?: number }[];
      }
    | null;

  const repo: GhRepoInfo | null =
    repoData?.stargazers_count != null && repoData.html_url
      ? {
          stars: repoData.stargazers_count,
          html_url: repoData.html_url,
          pushed_at: repoData.pushed_at ?? "",
        }
      : null;

  const latest_run: GhRunInfo | null =
    runData?.html_url && runData.head_sha
      ? {
          status: runData.status ?? "unknown",
          conclusion: runData.conclusion ?? null,
          html_url: runData.html_url,
          created_at: runData.created_at ?? "",
          head_sha: runData.head_sha,
        }
      : null;

  const asset = releaseData?.assets?.[0];
  const latest_release: GhReleaseInfo | null =
    releaseData?.tag_name && releaseData.html_url
      ? {
          tag: releaseData.tag_name,
          asset_name: asset?.name ?? null,
          asset_mb:
            typeof asset?.size === "number" && asset.size > 0
              ? Math.round((asset.size / (1024 * 1024)) * 10) / 10
              : null,
          html_url: releaseData.html_url,
        }
      : null;

  const error =
    repo || latest_run || latest_release
      ? null
      : "GITHUB_UNAVAILABLE";

  // The sandbox network often gets IP-rate-limited by the unauthenticated
  // GitHub API. Fall back to a cached snapshot (src/data/gh-status.json)
  // that the pipeline keeps fresh, so the dashboard always shows real data.
  if (error === "GITHUB_UNAVAILABLE") {
    try {
      const cachePath = path.join(
        process.cwd(),
        "src",
        "data",
        "gh-status.json",
      );
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
        repo?: GhRepoInfo | null;
        latest_run?: GhRunInfo | null;
        latest_release?: GhReleaseInfo | null;
        cached_at?: string;
      };
      if (cached.repo || cached.latest_run || cached.latest_release) {
        return NextResponse.json({
          repo: cached.repo ?? null,
          latest_run: cached.latest_run ?? null,
          latest_release: cached.latest_release ?? null,
          cached_at: cached.cached_at ?? null,
          error: null,
        });
      }
    } catch {
      // no snapshot available
    }
  }

  return NextResponse.json({ repo, latest_run, latest_release, error });
}
