// Entry point: fetch live GitHub data and regenerate README.md + assets/*.svg.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildReadme,
  formatCount,
  renderActivity,
  renderHeader,
  renderMetricCard,
  renderProjects,
  type ContributionData,
  type Project
} from "./render-profile.js";

const OWNER = process.env.PROFILE_OWNER ?? "traique";
const API_BASE = "https://api.github.com";
const USER_AGENT = "traique-profile-renderer";
const YEAR_MS = 365 * 86_400_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

const PROJECTS: ReadonlyArray<{ name: string; description: string }> = [
  { name: "chatgpt-gateway", description: "Gateway AI tương thích OpenAI, tập trung routing, xác thực và vận hành API." },
  { name: "agents-trading", description: "Hệ thống multi-agent nghiên cứu và phân tích chứng khoán Việt Nam." },
  { name: "stock-portfolio", description: "Quản lý danh mục, dữ liệu thị trường và AI insights cho chứng khoán Việt Nam." },
  { name: "lananh", description: "Trợ lý AI cá nhân đa kênh với memory, tools và pipeline nghiên cứu cổ phiếu." }
];

interface GitHubRepo {
  name: string;
  language: string | null;
  stargazers_count: number;
  html_url: string;
  archived: boolean;
}

interface GitHubProfile {
  followers: number;
}

interface GraphQLResponse {
  data?: { user: { contributionsCollection: ContributionData } | null };
  errors?: Array<{ message: string }>;
}

class HttpError extends Error {
  constructor(readonly status: number, url: string) {
    super(`GitHub request failed: ${status} ${url}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async <T>(token: string, path: string, init: RequestInit = {}): Promise<T> => {
  const url = `${API_BASE}${path}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": USER_AGENT,
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {})
        }
      });
      if (!response.ok) throw new HttpError(response.status, url);
      return (await response.json()) as T;
    } catch (error) {
      // Retry only on network errors, timeouts, rate limits and 5xx.
      const retryable = !(error instanceof HttpError) || error.status >= 500 || error.status === 429;
      if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
      console.warn(`Retry ${attempt}/${MAX_ATTEMPTS - 1}: ${(error as Error).message}`);
      await sleep(1000 * 2 ** attempt);
    }
  }
};

const fetchProfile = (token: string) => fetchJson<GitHubProfile>(token, `/users/${OWNER}`);

/** A missing/private/archived repo is skipped with a warning instead of failing the whole build. */
const fetchProjects = async (token: string): Promise<Project[]> => {
  const results = await Promise.all(
    PROJECTS.map(async ({ name, description }): Promise<Project | null> => {
      try {
        const repo = await fetchJson<GitHubRepo>(token, `/repos/${OWNER}/${name}`);
        if (repo.archived) {
          console.warn(`::warning::Skipping archived project ${name}`);
          return null;
        }
        return {
          name: repo.name,
          description,
          language: repo.language ?? "Đa ngôn ngữ",
          stars: repo.stargazers_count,
          url: repo.html_url
        };
      } catch (error) {
        console.warn(`::warning::Skipping project ${name}: ${(error as Error).message}`);
        return null;
      }
    })
  );
  const projects = results.filter((project): project is Project => project !== null);
  if (projects.length === 0) throw new Error("No featured projects could be loaded");
  return projects;
};

const fetchContributions = async (token: string): Promise<ContributionData> => {
  const to = new Date();
  const from = new Date(to.getTime() - YEAR_MS);
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){totalCommitContributions totalPullRequestContributions totalIssueContributions totalRepositoriesWithContributedCommits contributionCalendar{totalContributions weeks{contributionDays{contributionCount date}}}}}}`;
  const body = await fetchJson<GraphQLResponse>(token, "/graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables: { login: OWNER, from: from.toISOString(), to: to.toISOString() } })
  });
  const errors = body.errors?.map((error) => error.message).join("; ");
  const collection = body.data?.user?.contributionsCollection;
  if (errors || !collection) throw new Error(`GitHub GraphQL failed: ${errors ?? "empty response"}`);
  return collection;
};

const main = async (): Promise<void> => {
  const token = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN (or PROFILE_TOKEN) is required");

  const [profile, contributions, projects] = await Promise.all([
    fetchProfile(token),
    fetchContributions(token),
    fetchProjects(token)
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const root = process.cwd();
  const assets = join(root, "assets");

  const files: Record<string, string> = {
    "assets/contributions.svg": renderMetricCard({
      label: "ĐÓNG GÓP",
      value: formatCount(contributions.contributionCalendar.totalContributions),
      detail: "12 tháng gần nhất"
    }),
    "assets/commits.svg": renderMetricCard({
      label: "COMMIT",
      value: formatCount(contributions.totalCommitContributions),
      detail: `${formatCount(contributions.totalPullRequestContributions)} PR · ${formatCount(contributions.totalRepositoriesWithContributedCommits)} repo`
    }),
    "assets/network.svg": renderMetricCard({
      label: "FOLLOWERS",
      value: formatCount(profile.followers),
      detail: "mạng lưới GitHub"
    }),
    "assets/header.svg": renderHeader(today),
    "assets/activity.svg": renderActivity(contributions),
    "assets/projects.svg": renderProjects(projects),
    "README.md": buildReadme(projects, today)
  };

  await mkdir(assets, { recursive: true });
  await Promise.all(Object.entries(files).map(([path, content]) => writeFile(join(root, path), content, "utf8")));
  console.log(
    `Rendered ${Object.keys(files).length} files: ${contributions.contributionCalendar.totalContributions} contributions, ${projects.length} projects.`
  );
};

main().catch((error: unknown) => {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
