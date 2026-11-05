// Pure SVG/Markdown renderers. No I/O here so everything is unit-testable.

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

export interface ContributionCalendarDay {
  contributionCount: number;
  date: string;
}

export interface ContributionWeek {
  contributionDays: ContributionCalendarDay[];
}

export interface ContributionData {
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalIssueContributions: number;
  totalRepositoriesWithContributedCommits: number;
  contributionCalendar: {
    totalContributions: number;
    weeks: ContributionWeek[];
  };
}

export const CARD_WIDTH = 260;
export const CARD_HEIGHT = 120;
export const PROJECT_WIDTH = 720;
export const PROJECT_HEIGHT = 150;
export const ACTIVITY_DAYS = 84;
const PROJECT_GAP = 12;
const DESCRIPTION_LIMIT = 88;

export const esc = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const slug = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const formatCount = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
};

export const truncate = (value: string, limit: number): string => {
  const chars = [...value];
  return chars.length <= limit ? value : `${chars.slice(0, limit - 1).join("").trimEnd()}…`;
};

const STYLE =
  "@keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}" +
  "@keyframes scan{0%{transform:translateY(-180px)}100%{transform:translateY(180px)}}" +
  "@keyframes drift{0%,100%{transform:translateX(0)}50%{transform:translateX(12px)}}" +
  ".pulse{animation:pulse 2.4s ease-in-out infinite}" +
  ".scan{animation:scan 4.8s linear infinite}" +
  ".drift{animation:drift 4s ease-in-out infinite}" +
  "@media (prefers-reduced-motion:reduce){.pulse,.scan,.drift{animation:none}}";

const defs = (id: string): string =>
  `<linearGradient id="gradient-${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8b5cf6"/><stop offset=".52" stop-color="#22d3ee"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>` +
  `<filter id="glow-${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
  `<pattern id="grid-${id}" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#172033" stroke-width="1"/></pattern>`;

/** Wraps content in an accessible, self-contained SVG document. */
export const baseSvg = (width: number, height: number, content: string, id: string, title: string): string => {
  const safeId = slug(id) || "profile";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title-${safeId}"><title id="title-${safeId}">${esc(title)}</title><defs>${defs(safeId)}<style>${STYLE}</style></defs>${content}</svg>`;
};

const metricBody = (metric: Metric, id: string, width: number, height: number): string =>
  `<rect width="${width}" height="${height}" rx="18" fill="#080d19"/>` +
  `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="17" fill="none" stroke="#27334c"/>` +
  `<path d="M18 18h34M18 18v10M${width - 18} ${height - 18}h-34M${width - 18} ${height - 18}v-10" fill="none" stroke="#33415f"/>` +
  `<circle class="pulse" cx="${width - 24}" cy="24" r="4" fill="#22d3ee" filter="url(#glow-${id})"/>` +
  `<text x="20" y="34" fill="#7dd3fc" font-family="monospace" font-size="11" font-weight="700" letter-spacing="2">${esc(metric.label)}</text>` +
  `<rect x="20" y="46" width="56" height="3" rx="2" fill="url(#gradient-${id})"/>` +
  `<text x="20" y="82" fill="#ffffff" font-family="sans-serif" font-size="32" font-weight="800">${esc(metric.value)}</text>` +
  `<text x="20" y="104" fill="#94a3b8" font-family="sans-serif" font-size="11">${esc(metric.detail)}</text>`;

export const renderMetricCard = (metric: Metric, width = CARD_WIDTH, height = CARD_HEIGHT): string => {
  const id = slug(`metric-${metric.label}`) || "metric";
  return baseSvg(width, height, metricBody(metric, id, width, height), id, `${metric.label}: ${metric.value} (${metric.detail})`);
};

const projectBody = (project: Project, id: string, width: number, height: number): string =>
  `<rect width="${width}" height="${height}" rx="20" fill="#080d19"/>` +
  `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="19" fill="none" stroke="#27334c"/>` +
  `<rect width="${width}" height="${height}" rx="20" fill="url(#grid-${id})" opacity=".32"/>` +
  `<rect class="scan" x="0" y="0" width="${width}" height="2" fill="url(#gradient-${id})" opacity=".8"/>` +
  `<circle cx="28" cy="30" r="5" fill="#22d3ee" filter="url(#glow-${id})"/>` +
  `<text x="44" y="37" fill="#ffffff" font-family="monospace" font-size="20" font-weight="700">${esc(project.name)}</text>` +
  `<text x="${width - 26}" y="36" text-anchor="end" fill="#67e8f9" font-family="monospace" font-size="11">${esc(project.language)}</text>` +
  `<text x="26" y="68" fill="#cbd5e1" font-family="sans-serif" font-size="13">${esc(truncate(project.description, DESCRIPTION_LIMIT))}</text>` +
  `<path d="M26 86H${width - 26}" stroke="#1e293b"/>` +
  `<text x="26" y="112" fill="#94a3b8" font-family="monospace" font-size="11">★ ${formatCount(project.stars)}  ·  ĐANG HOẠT ĐỘNG</text>` +
  `<text x="${width - 26}" y="112" text-anchor="end" fill="#67e8f9" font-family="monospace" font-size="11">MỞ DỰ ÁN  →</text>`;

export const renderProjectCard = (project: Project, width = PROJECT_WIDTH, height = PROJECT_HEIGHT): string => {
  const id = slug(`project-${project.name}`) || "project";
  return baseSvg(width, height, projectBody(project, id, width, height), id, `${project.name} — ${project.description}`);
};

/** Stacks project cards into one SVG. Each card owns its own defs so ids never collide. */
export const renderProjects = (projects: Project[]): string => {
  const height = Math.max(projects.length * (PROJECT_HEIGHT + PROJECT_GAP) - PROJECT_GAP, 1);
  const cards = projects
    .map((project, index) => {
      const id = slug(`project-${project.name}`) || `project-${index}`;
      return `<g transform="translate(0 ${index * (PROJECT_HEIGHT + PROJECT_GAP)})"><defs>${defs(id)}</defs>${projectBody(project, id, PROJECT_WIDTH, PROJECT_HEIGHT)}</g>`;
    })
    .join("");
  return baseSvg(PROJECT_WIDTH, height, cards, "projects", `Các dự án nổi bật: ${projects.map((p) => p.name).join(", ")}`);
};

export const renderHeader = (today: string): string => {
  const content =
    `<rect width="960" height="190" rx="28" fill="#060a13"/>` +
    `<rect width="960" height="190" rx="28" fill="url(#grid-header)" opacity=".55"/>` +
    `<path class="drift" d="M0 158H960M0 160H960" stroke="#17233a"/>` +
    `<path d="M44 26V164M916 26V164" stroke="#17233a"/>` +
    `<circle class="pulse" cx="884" cy="46" r="7" fill="#22d3ee" filter="url(#glow-header)"/>` +
    `<circle cx="884" cy="46" r="14" fill="none" stroke="#22d3ee" opacity=".15"/>` +
    `<text x="44" y="54" fill="#67e8f9" font-family="monospace" font-size="12" letter-spacing="3">HỆ THỐNG / TRAIQUE</text>` +
    `<text x="44" y="106" fill="#ffffff" font-family="sans-serif" font-size="42" font-weight="800">AI × TỰ ĐỘNG HÓA × GIAO DỊCH</text>` +
    `<text x="44" y="136" fill="#a5b4fc" font-family="monospace" font-size="13">xây hệ thống thực tế · tự động hóa · dữ liệu · AI</text>` +
    `<text x="44" y="171" fill="#64748b" font-family="monospace" font-size="10">TRẠNG THÁI: ONLINE  •  VIỆT NAM  •  ${esc(today)}</text>` +
    `<text x="916" y="171" text-anchor="end" fill="#334155" font-family="monospace" font-size="10">PROFILE ENGINE / v3</text>`;
  return baseSvg(960, 190, content, "header", "Traique — AI, tự động hóa và giao dịch");
};

export const renderActivity = (contributions: ContributionData): string => {
  const days = contributions.contributionCalendar.weeks.flatMap((week) => week.contributionDays).slice(-ACTIVITY_DAYS);
  const max = Math.max(1, ...days.map((day) => day.contributionCount));
  const cells = days
    .map((day, index) => {
      const level = day.contributionCount === 0 ? 0 : Math.min(4, Math.ceil((day.contributionCount / max) * 4));
      const x = 26 + (index % 12) * 24;
      const y = 48 + Math.floor(index / 12) * 15;
      const opacity = level === 0 ? 0.45 : 0.35 + level * 0.16;
      const fill = level === 0 ? "#172033" : "url(#gradient-activity)";
      return `<rect x="${x}" y="${y}" width="16" height="10" rx="3" fill="${fill}" opacity="${opacity.toFixed(2)}"><title>${esc(day.date)}: ${day.contributionCount}</title></rect>`;
    })
    .join("");
  const peak = days.reduce<ContributionCalendarDay | null>(
    (best, day) => (!best || day.contributionCount > best.contributionCount ? day : best),
    null
  );
  const recent = days.reduce((sum, day) => sum + day.contributionCount, 0);
  const total = formatCount(contributions.contributionCalendar.totalContributions);
  const content =
    `<rect width="720" height="150" rx="20" fill="#080d19"/>` +
    `<rect x="1" y="1" width="718" height="148" rx="19" fill="none" stroke="#27334c"/>` +
    `<text x="26" y="29" fill="#7dd3fc" font-family="monospace" font-size="11" font-weight="700" letter-spacing="2">HOẠT ĐỘNG / ${ACTIVITY_DAYS} NGÀY</text>` +
    cells +
    `<text x="505" y="58" fill="#ffffff" font-family="sans-serif" font-size="28" font-weight="800">${total}</text>` +
    `<text x="505" y="76" fill="#94a3b8" font-family="monospace" font-size="10">ĐÓNG GÓP / 12 THÁNG</text>` +
    `<text x="505" y="96" fill="#94a3b8" font-family="monospace" font-size="10">${formatCount(recent)} trong ${ACTIVITY_DAYS} ngày qua</text>` +
    `<text x="505" y="113" fill="#64748b" font-family="monospace" font-size="10">ĐỈNH: ${esc(peak?.date ?? "—")} · ${peak?.contributionCount ?? 0}</text>` +
    `<rect x="505" y="124" width="80" height="3" rx="2" fill="url(#gradient-activity)"/>`;
  return baseSvg(720, 150, content, "activity", `Hoạt động GitHub: ${total} đóng góp trong 12 tháng`);
};

export const buildReadme = (projects: Project[], today: string): string => {
  const projectLinks = projects
    .map((project) => `- [**${project.name}**](${project.url}) — ${project.description}`)
    .join("\n");
  return `<div align="center">

<img src="./assets/header.svg" width="960" alt="Hồ sơ AI, tự động hóa và giao dịch của Traique"/>

<img src="./assets/contributions.svg" width="260" alt="Đóng góp GitHub"/>
<img src="./assets/commits.svg" width="260" alt="Commit GitHub"/>
<img src="./assets/network.svg" width="260" alt="Mạng lưới GitHub"/>

<img src="./assets/activity.svg" width="720" alt="Hoạt động GitHub ${ACTIVITY_DAYS} ngày"/>

</div>

## ⚡ Tôi xây dựng gì?

**AI · Tự động hóa · Hệ thống giao dịch · Developer Tools** — tập trung vào những hệ thống thực tế, có thể triển khai và vận hành.

## 🚀 ${projects.length} hệ thống nổi bật

<img src="./assets/projects.svg" width="720" alt="Các hệ thống nổi bật"/>

${projectLinks}

## 🧠 Tech stack

\`Python\` · \`TypeScript\` · \`Next.js\` · \`FastAPI\` · \`Supabase\` · \`LLM Agents\` · \`GitHub Actions\` · \`Trading Systems\`

## 📡 Hồ sơ sống

Các số liệu và artwork được **GitHub Actions tự động cập nhật mỗi 12 giờ** từ dữ liệu GitHub thực tế. Không dùng widget thống kê bên ngoài, không JavaScript phía client và không hardcode số liệu hoạt động.

<div align="center">

\`BUILD → MEASURE → AUTOMATE → REPEAT\`

<sub>⚙️ Hồ sơ tự vận hành · cập nhật ${today}</sub>

</div>
`;
};
