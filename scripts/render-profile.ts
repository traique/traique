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
const PROJECT_NAMES = ["chatgpt-gateway", "agents-trading", "stock-portfolio", "lananh"] as const;
const PROJECT_COPY: Record<(typeof PROJECT_NAMES)[number], string> = {
  "chatgpt-gateway": "Gateway AI tương thích OpenAI, tập trung routing, xác thực và vận hành API.",
  "agents-trading": "Hệ thống multi-agent nghiên cứu và phân tích chứng khoán Việt Nam.",
  "stock-portfolio": "Quản lý danh mục, dữ liệu thị trường và AI insights cho chứng khoán Việt Nam.",
  lananh: "Trợ lý AI cá nhân đa kênh với memory, tools và pipeline nghiên cứu cổ phiếu."
};
const API_BASE = "https://api.github.com";
const GRAPHQL_URL = "https://api.github.com/graphql";
const OUTPUT_DIR = join(process.cwd(), "assets");
const YEAR_IN_DAYS = 365;
const ACTIVITY_DAYS = 84;
const CARD_WIDTH = 260;
const CARD_HEIGHT = 120;
const PROJECT_WIDTH = 720;
const PROJECT_HEIGHT = 150;
const USER_AGENT = "traique-profile-renderer";

const esc = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

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
  return Promise.all(
    PROJECT_NAMES.map(async (name) => {
      const repo = await fetchJson<GitHubRepo>(`${API_BASE}/repos/${OWNER}/${name}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (repo.archived || repo.fork) throw new Error(`Configured project is not active: ${name}`);
      return {
        name: repo.name,
        description: PROJECT_COPY[name],
        language: repo.language ?? "Đa ngôn ngữ",
        stars: repo.stargazers_count,
        url: repo.html_url
      } satisfies Project;
    })
  );
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

const baseSvg = (width: number, height: number, content: string, id = "profile"): string => {
  const safeId = slug(id) || "profile";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><defs><linearGradient id="gradient-${safeId}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8b5cf6"/><stop offset=".52" stop-color="#22d3ee"/><stop offset="1" stop-color="#a78bfa"/></linearGradient><filter id="glow-${safeId}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><pattern id="grid-${safeId}" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#172033" stroke-width="1"/></pattern><style>@keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}@keyframes scan{0%{transform:translateY(-180px)}100%{transform:translateY(180px)}}@keyframes drift{0%,100%{transform:translateX(0)}50%{transform:translateX(12px)}}.pulse{animation:pulse 2.4s ease-in-out infinite}.scan{animation:scan 4.8s linear infinite}.drift{animation:drift 4s ease-in-out infinite}</style></defs>${content}</svg>`;
};

export const renderMetricCard = (metric: Metric, width: number, height: number): string => {
  const id = slug(metric.label);
  const gradient = `url(#gradient-${id})`;
  const content = `<rect width="${width}" height="${height}" rx="18" fill="#080d19"/><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="17" fill="none" stroke="#27334c"/><path d="M18 18h34M18 18v10M${width - 18} ${height - 18}h-34M${width - 18} ${height - 18}v-10" fill="none" stroke="#33415f"/><circle class="pulse" cx="${width - 24}" cy="24" r="4" fill="#22d3ee" filter="url(#glow-${id})"/><text x="20" y="34" fill="#7dd3fc" font-family="monospace" font-size="11" font-weight="700" letter-spacing="2">${esc(metric.label)}</text><rect x="20" y="46" width="56" height="3" rx="2" fill="${gradient}"/><text x="20" y="82" fill="white" font-family="sans-serif" font-size="32" font-weight="800">${esc(metric.value)}</text><text x="20" y="104" fill="#94a3b8" font-family="sans-serif" font-size="11">${esc(metric.detail)}</text>`;
  return baseSvg(width, height, content, id);
};

export const renderProjectCard = (project: Project, width: number, height: number): string => {
  const id = slug(project.name);
  const gradient = `url(#gradient-${id})`;
  const content = `<rect width="${width}" height="${height}" rx="20" fill="#080d19"/><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="19" fill="none" stroke="#27334c"/><rect width="${width}" height="${height}" rx="20" fill="url(#grid-${id})" opacity=".32"/><rect class="scan" x="0" y="0" width="${width}" height="2" fill="${gradient}" opacity=".8"/><circle cx="28" cy="30" r="5" fill="#22d3ee" filter="url(#glow-${id})"/><text x="44" y="37" fill="white" font-family="monospace" font-size="20" font-weight="700">${esc(project.name)}</text><text x="${width - 26}" y="36" text-anchor="end" fill="#67e8f9" font-family="monospace" font-size="11">${esc(project.language)}</text><text x="26" y="68" fill="#cbd5e1" font-family="sans-serif" font-size="13">${esc(project.description.slice(0, 88))}</text><path d="M26 86H${width - 26}" stroke="#1e293b"/><text x="26" y="112" fill="#94a3b8" font-family="monospace" font-size="11">★ ${formatCount(project.stars)}  ·  ĐANG HOẠT ĐỘNG</text><text x="${width - 26}" y="112" text-anchor="end" fill="#67e8f9" font-family="monospace" font-size="11">MỞ DỰ ÁN  →</text>`;
  return baseSvg(width, height, content, id);
};

const renderHeader = (): string => {
  const content = `<rect width="960" height="190" rx="28" fill="#060a13"/><rect width="960" height="190" rx="28" fill="url(#grid-header)" opacity=".55"/><path class="drift" d="M0 158H960M0 160H960" stroke="#17233a"/><path d="M44 26V164M916 26V164" stroke="#17233a"/><circle class="pulse" cx="884" cy="46" r="7" fill="#22d3ee" filter="url(#glow-header)"/><circle cx="884" cy="46" r="14" fill="none" stroke="#22d3ee" opacity=".15"/><text x="44" y="54" fill="#67e8f9" font-family="monospace" font-size="12" letter-spacing="3">HỆ THỐNG / TRAIQUE</text><text x="44" y="106" fill="white" font-family="sans-serif" font-size="42" font-weight="800">AI × TỰ ĐỘNG HÓA × GIAO DỊCH</text><text x="44" y="136" fill="#a5b4fc" font-family="monospace" font-size="13">xây hệ thống thực tế · tự động hóa · dữ liệu · AI</text><text x="44" y="171" fill="#64748b" font-family="monospace" font-size="10">TRẠNG THÁI: ONLINE  •  VIỆT NAM  •  ${new Date().toISOString().slice(0, 10)}</text><text x="916" y="171" text-anchor="end" fill="#334155" font-family="monospace" font-size="10">PROFILE ENGINE / v2</text>`;
  return baseSvg(960, 190, content, "header");
};

export const renderActivity = (contributions: ContributionData): string => {
  const days = contributions.contributionCalendar.weeks.flatMap((week) => week.contributionDays).slice(-ACTIVITY_DAYS);
  const max = Math.max(...days.map((day) => day.contributionCount), 1);
  const cells = days.map((day, index) => {
    const level = day.contributionCount === 0 ? 0 : Math.min(4, Math.ceil((day.contributionCount / max) * 4));
    const x = 26 + (index % 12) * 24;
    const y = 48 + Math.floor(index / 12) * 15;
    const opacity = level === 0 ? 0.45 : 0.35 + level * 0.16;
    return `<rect x="${x}" y="${y}" width="16" height="10" rx="3" fill="${level === 0 ? "#172033" : "url(#gradient-activity)"}" opacity="${opacity}"/>`;
  }).join("");
  const peak = days.reduce<ContributionCalendarDay | null>((best, day) => (!best || day.contributionCount > best.contributionCount ? day : best), null);
  const content = `<rect width="720" height="150" rx="20" fill="#080d19"/><rect x="1" y="1" width="718" height="148" rx="19" fill="none" stroke="#27334c"/><text x="26" y="29" fill="#7dd3fc" font-family="monospace" font-size="11" font-weight="700" letter-spacing="2">HOẠT ĐỘNG / 84 NGÀY</text>${cells}<text x="505" y="68" fill="white" font-family="sans-serif" font-size="28" font-weight="800">${formatCount(contributions.contributionCalendar.totalContributions)}</text><text x="505" y="88" fill="#94a3b8" font-family="monospace" font-size="10">ĐÓNG GÓP / 12 THÁNG</text><text x="505" y="111" fill="#64748b" font-family="monospace" font-size="10">ĐỈNH: ${peak?.date ?? "—"} · ${peak?.contributionCount ?? 0} đóng góp</text><rect x="505" y="122" width="80" height="3" rx="2" fill="url(#gradient-activity)"/>`;
  return baseSvg(720, 150, content, "activity");
};

const renderProjects = (projects: Project[]): string => {
  const cards = projects.map((project, index) => {
    const svg = renderProjectCard(project, PROJECT_WIDTH, PROJECT_HEIGHT).replace(/^<svg[^>]*>|<\/svg>$/g, "");
    return `<g transform="translate(0 ${index * (PROJECT_HEIGHT + 12)})">${svg}</g>`;
  }).join("");
  return baseSvg(PROJECT_WIDTH, projects.length * (PROJECT_HEIGHT + 12), cards, "projects");
};

const buildReadme = (projects: Project[]): string => {
  const projectLinks = projects.map((project) => `- [**${project.name}**](${project.url}) — ${project.description}`).join("\n");
  return `# traique\n\n<div align="center">\n\n<img src="./assets/header.svg" width="960" alt="Hồ sơ AI, tự động hóa và giao dịch của Traique"/>\n\n<img src="./assets/contributions.svg" width="260" alt="Đóng góp GitHub"/>\n<img src="./assets/commits.svg" width="260" alt="Commit GitHub"/>\n<img src="./assets/network.svg" width="260" alt="Mạng lưới GitHub"/>\n\n<img src="./assets/activity.svg" width="720" alt="Hoạt động GitHub 84 ngày"/>\n\n</div>\n\n## ⚡ Tôi xây dựng gì?\n\n**AI · Tự động hóa · Hệ thống giao dịch · Developer Tools** — tập trung vào những hệ thống thực tế, có thể triển khai và vận hành.\n\n## 🚀 4 hệ thống nổi bật\n\n<img src="./assets/projects.svg" width="720" alt="Bốn hệ thống nổi bật"/>\n\n${projectLinks}\n\n## 🧠 Tech stack\n\n\`Python\` · \`TypeScript\` · \`Next.js\` · \`FastAPI\` · \`Supabase\` · \`LLM Agents\` · \`GitHub Actions\` · \`Trading Systems\`\n\n## 📡 Hồ sơ sống\n\nCác số liệu và artwork được **GitHub Actions tự động cập nhật mỗi 12 giờ** từ dữ liệu GitHub thực tế. Không dùng widget thống kê bên ngoài, không JavaScript phía client và không hardcode số liệu hoạt động.\n\n<div align="center">\n\n\`BUILD → MEASURE → AUTOMATE → REPEAT\`\n\n<sub>⚙️ Hồ sơ tự vận hành · cập nhật tự động · ${new Date().toISOString()}</sub>\n\n</div>\n`;
};

const writeArtifacts = async (profile: GitHubProfile, contributions: ContributionData, projects: Project[]): Promise<void> => {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const metrics = [
    ["contributions.svg", renderMetricCard({ label: "ĐÓNG GÓP", value: formatCount(contributions.contributionCalendar.totalContributions), detail: "12 tháng gần nhất" }, CARD_WIDTH, CARD_HEIGHT)],
    ["commits.svg", renderMetricCard({ label: "COMMIT", value: formatCount(contributions.totalCommitContributions), detail: "12 tháng gần nhất" }, CARD_WIDTH, CARD_HEIGHT)],
    ["network.svg", renderMetricCard({ label: "FOLLOWERS", value: formatCount(profile.followers), detail: "mạng lưới GitHub" }, CARD_WIDTH, CARD_HEIGHT)],
    ["header.svg", renderHeader()],
    ["activity.svg", renderActivity(contributions)],
    ["projects.svg", renderProjects(projects)]
  ] as const;
  await Promise.all(metrics.map(([name, content]) => writeFile(join(OUTPUT_DIR, name), content, "utf8")));
  await writeFile(join(process.cwd(), "README.md"), buildReadme(projects), "utf8");
};

const main = async (): Promise<void> => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const [profile, contributions, projects] = await Promise.all([fetchProfile(token), fetchContributions(token), fetchProjects(token)]);
  await writeArtifacts(profile, contributions, projects);
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
