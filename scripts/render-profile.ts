import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface Metric {
  label: string;
  value: string;
  detail: string;
}

export interface Project {
  name: string;
  description: string;
  language: string;
  stars: number;
  url: string;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  html_url: string;
  archived: boolean;
  fork: boolean;
}

interface GitHubProfile {
  public_repos: number;
  followers: number;
  following: number;
}

interface ContributionCalendarDay {
  contributionCount: number;
  date: string;
}

interface ContributionWeek {
  contributionDays: ContributionCalendarDay[];
}

interface ContributionData {
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalIssueContributions: number;
  totalRepositoriesWithContributedCommits: number;
  contributionCalendar: {
    totalContributions: number;
    weeks: ContributionWeek[];
  };
}

interface GraphQLResponse {
  data?: {
    user: {
      contributionsCollection: ContributionData;
    };
  };
  errors?: Array<{ message: string }>;
}

const OWNER = "traique";
const PROJECT_NAMES = ["chatgpt-gateway", "agents-trading", "stock-portfolio", "Gemini"] as const;
const API_BASE = "https://api.github.com";
const GRAPHQL_URL = "https://api.github.com/graphql";
const OUTPUT_DIR = join(process.cwd(), "assets");
const YEAR_IN_DAYS = 365;
const TOP_CONTRIBUTION_DAYS = 7;
const CARD_WIDTH = 260;
const CARD_HEIGHT = 120;
const PROJECT_WIDTH = 720;
const PROJECT_HEIGHT = 150;
const USER_AGENT = "traique-profile-renderer";

const esc = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export const formatCount = (value: number): string => {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
      ...init?.headers
    }
  });
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${url}`);
  return response.json() as Promise<T>;
};

const fetchProfile = async (token: string): Promise<GitHubProfile> =>
  fetchJson<GitHubProfile>(`${API_BASE}/users/${OWNER}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });

const fetchProjects = async (token: string): Promise<Project[]> => {
  const repositories = await Promise.all(
    PROJECT_NAMES.map(async (name) => {
      const repo = await fetchJson<GitHubRepo>(`${API_BASE}/repos/${OWNER}/${name}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (repo.archived || repo.fork) throw new Error(`Configured project is not active: ${name}`);
      return {
        name: repo.name,
        description: repo.description ?? "No description yet.",
        language: repo.language ?? "Mixed",
        stars: repo.stargazers_count,
        url: repo.html_url
      } satisfies Project;
    })
  );
  return repositories;
};

const fetchContributions = async (token: string): Promise<ContributionData> => {
  const from = new Date(Date.now() - YEAR_IN_DAYS * 86_400_000).toISOString();
  const to = new Date().toISOString();
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){totalCommitContributions totalPullRequestContributions totalIssueContributions totalRepositoriesWithContributedCommits contributionCalendar{totalContributions weeks{contributionDays{contributionCount date}}}}}}`;
  const body = await fetchJson<GraphQLResponse>(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: OWNER, from, to } })
  });
  const errors = body.errors?.map((error) => error.message).join("; ");
  if (errors || !body.data) throw new Error(`GitHub GraphQL failed: ${errors ?? "empty response"}`);
  return body.data.user.contributionsCollection;
};

const baseSvg = (width: number, height: number, content: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#06b6d4"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><style>@keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}@keyframes scan{0%{transform:translateY(-140px)}100%{transform:translateY(140px)}}.pulse{animation:pulse 2.4s ease-in-out infinite}.scan{animation:scan 5s linear infinite}</style></defs>${content}</svg>`;

export const renderMetricCard = (metric: Metric, width: number, height: number): string =>
  baseSvg(width, height, `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="18" fill="#0b1020" stroke="#26304a"/><circle class="pulse" cx="${width - 24}" cy="24" r="4" fill="#22d3ee"/><text x="20" y="32" fill="#7dd3fc" font-family="monospace" font-size="12" letter-spacing="2">${esc(metric.label)}</text><text x="20" y="76" fill="white" font-family="sans-serif" font-size="32" font-weight="700">${esc(metric.value)}</text><text x="20" y="101" fill="#94a3b8" font-family="sans-serif" font-size="12">${esc(metric.detail)}</text>`);

export const renderProjectCard = (project: Project, width: number, height: number): string =>
  baseSvg(width, height, `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="20" fill="#0b1020" stroke="#26304a"/><rect class="scan" x="0" y="0" width="${width}" height="2" fill="url(#g)" opacity=".5"/><text x="26" y="39" fill="white" font-family="monospace" font-size="20" font-weight="700">${esc(project.name)}</text><text x="${width - 28}" y="38" text-anchor="end" fill="#67e8f9" font-family="monospace" font-size="12">${esc(project.language)}</text><text x="26" y="68" fill="#94a3b8" font-family="sans-serif" font-size="13">${esc(project.description.slice(0, 82))}</text><text x="26" y="96" fill="#cbd5e1" font-family="monospace" font-size="12">★ ${formatCount(project.stars)}  ·  LIVE REPO</text><text x="${width - 28}" y="98" text-anchor="end" fill="#67e8f9" font-family="monospace" font-size="12">OPEN →</text>`);

const renderHeader = (): string =>
  baseSvg(960, 190, `<rect width="960" height="190" rx="28" fill="#070b14"/><path d="M0 155H960" stroke="#1e293b"/><path d="M0 45H960" stroke="#1e293b" opacity=".5"/><circle class="pulse" cx="884" cy="46" r="7" fill="#22d3ee" filter="url(#glow)"/><text x="44" y="58" fill="#67e8f9" font-family="monospace" font-size="12" letter-spacing="3">SYSTEM / TRAIQUE</text><text x="44" y="108" fill="white" font-family="sans-serif" font-size="42" font-weight="800">AI × AUTOMATION × TRADING</text><text x="44" y="138" fill="#94a3b8" font-family="monospace" font-size="14">building useful systems, one commit at a time.</text><text x="44" y="173" fill="#64748b" font-family="monospace" font-size="11">STATUS: ONLINE  •  VIETNAM  •  ${new Date().toISOString().slice(0, 10)}</text>`);

const renderActivity = (contributions: ContributionData): string => {
  const days = contributions.contributionCalendar.weeks.flatMap((week) => week.contributionDays);
  const recent = days.slice(-84);
  const max = Math.max(...recent.map((day) => day.contributionCount), 1);
  const cells = recent.map((day, index) => {
    const level = Math.min(4, Math.ceil((day.contributionCount / max) * 4));
    const x = 24 + (index % 28) * 24;
    const y = 46 + Math.floor(index / 28) * 24;
    return `<rect x="${x}" y="${y}" width="16" height="16" rx="4" fill="${level === 0 ? "#172033" : `url(#g)`}" opacity="${level === 0 ? ".7" : 0.35 + level * 0.15}"/>`;
  }).join("");
  const topDays = [...days].sort((a, b) => b.contributionCount - a.contributionCount).slice(0, TOP_CONTRIBUTION_DAYS);
  return baseSvg(720, 150, `<rect x="1" y="1" width="718" height="148" rx="20" fill="#0b1020" stroke="#26304a"/><text x="24" y="28" fill="#7dd3fc" font-family="monospace" font-size="11" letter-spacing="2">CONTRIBUTION MATRIX / 12 WEEKS</text>${cells}<text x="${720 - 24}" y="72" text-anchor="end" fill="white" font-family="sans-serif" font-size="26" font-weight="700">${formatCount(contributions.contributionCalendar.totalContributions)}</text><text x="${720 - 24}" y="94" text-anchor="end" fill="#94a3b8" font-family="monospace" font-size="11">contributions / year</text><text x="${720 - 24}" y="119" text-anchor="end" fill="#64748b" font-family="monospace" font-size="10">peak day: ${topDays[0]?.date ?? "n/a"}</text>`);
};

const renderProjects = (projects: Project[]): string => {
  const cards = projects.map((project, index) => renderProjectCard(project, PROJECT_WIDTH, PROJECT_HEIGHT)).map((svg) => svg.replace(/^<svg[^>]*>|<\/svg>$/g, ""));
  const content = cards.map((card, index) => `<g transform="translate(0 ${index * (PROJECT_HEIGHT + 12)})">${card}</g>`).join("");
  return baseSvg(PROJECT_WIDTH, projects.length * (PROJECT_HEIGHT + 12), content);
};

const buildReadme = (profile: GitHubProfile, contributions: ContributionData, projects: Project[]): string => {
  const metricValues = [
    renderMetricCard({ label: "CONTRIBUTIONS", value: formatCount(contributions.contributionCalendar.totalContributions), detail: "last 12 months" }, CARD_WIDTH, CARD_HEIGHT),
    renderMetricCard({ label: "COMMITS", value: formatCount(contributions.totalCommitContributions), detail: "last 12 months" }, CARD_WIDTH, CARD_HEIGHT),
    renderMetricCard({ label: "FOLLOWERS", value: formatCount(profile.followers), detail: "GitHub network" }, CARD_WIDTH, CARD_HEIGHT)
  ];
  const metricNames = ["contributions", "commits", "network"];
  const projectLinks = projects.map((project) => `- [**${project.name}**](${project.url}) — ${project.description}`).join("\n");
  const metricsHtml = metricValues.map((svg, index) => {
    const name = metricNames[index];
    return `<img src="./assets/${name}.svg" width="260" alt="${name}"/>`;
  }).join("\n");
  return `# traique\n\n<div align="center">\n\n<img src="./assets/header.svg" width="960" alt="AI automation trading profile header"/>\n\n${metricsHtml}\n\n<img src="./assets/activity.svg" width="720" alt="GitHub contribution activity"/>\n\n</div>\n\n## ⚡ What I build\n\nAI systems, automation, developer tooling and quantitative research workflows — with a bias toward practical products that can actually run.\n\n## 🚀 Featured systems\n\n${projectLinks}\n\n## 🧩 Stack\n\n\`Python\` · \`TypeScript\` · \`Next.js\` · \`FastAPI\` · \`Supabase\` · \`LLM Agents\` · \`GitHub Actions\` · \`Trading Systems\`\n\n## 📡 Profile engine\n\nThis profile is self-hosted: GitHub Actions refreshes the metrics and SVG artwork automatically. No external stats widget, no client-side JavaScript, no hardcoded activity numbers.\n\n<div align="center">\n\n<sub>Last render: ${new Date().toISOString()}</sub>\n\n</div>\n`;
};

const writeArtifacts = async (profile: GitHubProfile, contributions: ContributionData, projects: Project[]): Promise<void> => {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const metrics = [
    ["contributions.svg", renderMetricCard({ label: "CONTRIBUTIONS", value: formatCount(contributions.contributionCalendar.totalContributions), detail: "last 12 months" }, CARD_WIDTH, CARD_HEIGHT)],
    ["commits.svg", renderMetricCard({ label: "COMMITS", value: formatCount(contributions.totalCommitContributions), detail: "last 12 months" }, CARD_WIDTH, CARD_HEIGHT)],
    ["network.svg", renderMetricCard({ label: "FOLLOWERS", value: formatCount(profile.followers), detail: "GitHub network" }, CARD_WIDTH, CARD_HEIGHT)],
    ["header.svg", renderHeader()],
    ["activity.svg", renderActivity(contributions)],
    ["projects.svg", renderProjects(projects)]
  ] as const;
  await Promise.all(metrics.map(([name, content]) => writeFile(join(OUTPUT_DIR, name), content, "utf8")));
  await writeFile(join(process.cwd(), "README.md"), buildReadme(profile, contributions, projects), "utf8");
};

const main = async (): Promise<void> => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const [profile, contributions, projects] = await Promise.all([fetchProfile(token), fetchContributions(token), fetchProjects(token)]);
  await writeArtifacts(profile, contributions, projects);
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
