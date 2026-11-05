import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReadme,
  formatCount,
  renderActivity,
  renderHeader,
  renderMetricCard,
  renderProjectCard,
  renderProjects,
  slug,
  truncate,
  type ContributionData,
  type Metric,
  type Project
} from "./render-profile.js";

/** The SVG namespace URI is an identifier, not a fetched resource; anything else would be external. */
const assertSelfContained = (svg: string): void => {
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  const body = svg.replace('xmlns="http://www.w3.org/2000/svg"', "");
  assert.doesNotMatch(body, /https?:\/\//i, "SVG must not reference external URLs");
  assert.doesNotMatch(body, /<script|<foreignObject|\bon[a-z]+=/i, "SVG must not contain scripts or handlers");
  assert.match(svg, /<title id="title-[a-z0-9-]+">/, "SVG must have an accessible title");
};

const assertUniqueIds = (svg: string): void => {
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(",")}`);
};

const project = (name: string, extra: Partial<Project> = {}): Project => ({
  name,
  description: "A useful project",
  language: "TypeScript",
  stars: 12,
  url: `https://github.com/traique/${name}`,
  ...extra
});

test("formatCount keeps small counts exact and abbreviates large counts", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(1000), "1k");
  assert.equal(formatCount(1200), "1.2k");
  assert.equal(formatCount(1500000), "1.5M");
  assert.equal(formatCount(-5), "0");
  assert.equal(formatCount(Number.NaN), "0");
});

test("slug strips Vietnamese diacritics into stable ids", () => {
  assert.equal(slug("ĐÓNG GÓP"), "dong-gop");
  assert.equal(slug("demo<&"), "demo");
});

test("truncate respects unicode characters", () => {
  assert.equal(truncate("ngắn", 10), "ngắn");
  assert.equal(truncate("hệ thống giao dịch", 6), "hệ th…");
});

test("metric card renders self-contained animated SVG", () => {
  const metric: Metric = { label: "COMMIT", value: "42", detail: "12 tháng gần nhất" };
  const svg = renderMetricCard(metric);
  assert.match(svg, /COMMIT/);
  assert.match(svg, />42</);
  assert.match(svg, /@keyframes/);
  assert.match(svg, /prefers-reduced-motion/);
  assert.match(svg, /linearGradient/);
  assertSelfContained(svg);
  assertUniqueIds(svg);
});

test("metric cards with Vietnamese labels get distinct gradient ids", () => {
  const a = renderMetricCard({ label: "ĐÓNG GÓP", value: "1", detail: "x" });
  const b = renderMetricCard({ label: "COMMIT", value: "1", detail: "x" });
  assert.match(a, /gradient-metric-dong-gop/);
  assert.match(b, /gradient-metric-commit/);
});

test("project card escapes repository text and stays self-contained", () => {
  const svg = renderProjectCard(project("demo<&", { description: "A <safe> \"project\"" }));
  assert.match(svg, /demo&lt;&amp;/);
  assert.match(svg, /A &lt;safe&gt; &quot;project&quot;/);
  assert.match(svg, /★ 12/);
  assert.match(svg, /MỞ/);
  assertSelfContained(svg);
});

test("projects SVG stacks cards without id collisions or nested <svg>", () => {
  const svg = renderProjects([project("alpha"), project("beta"), project("gamma")]);
  assert.equal(svg.match(/<svg/g)?.length, 1);
  assert.match(svg, /height="474"/);
  assert.match(svg, /gradient-project-alpha/);
  assert.match(svg, /gradient-project-gamma/);
  assertSelfContained(svg);
  assertUniqueIds(svg);
});

test("activity renders the last 84 days and highlights the peak", () => {
  const days = Array.from({ length: 100 }, (_, i) => ({
    date: `2026-01-${String(i).padStart(3, "0")}`,
    contributionCount: i === 95 ? 9 : i % 3
  }));
  const data: ContributionData = {
    totalCommitContributions: 10,
    totalPullRequestContributions: 2,
    totalIssueContributions: 1,
    totalRepositoriesWithContributedCommits: 3,
    contributionCalendar: { totalContributions: 1234, weeks: [{ contributionDays: days }] }
  };
  const svg = renderActivity(data);
  assert.equal(svg.match(/<rect x="\d+" y="\d+" width="16"/g)?.length, 84);
  assert.match(svg, /1\.2k/);
  assert.match(svg, /ĐỈNH: 2026-01-095 · 9/);
  assertSelfContained(svg);
  assertUniqueIds(svg);
});

test("activity tolerates an empty calendar", () => {
  const svg = renderActivity({
    totalCommitContributions: 0,
    totalPullRequestContributions: 0,
    totalIssueContributions: 0,
    totalRepositoriesWithContributedCommits: 0,
    contributionCalendar: { totalContributions: 0, weeks: [] }
  });
  assert.match(svg, /ĐỈNH: — · 0/);
  assertSelfContained(svg);
});

test("header shows the render date", () => {
  const svg = renderHeader("2026-11-05");
  assert.match(svg, /2026-11-05/);
  assertSelfContained(svg);
});

test("README links every project and references all assets", () => {
  const readme = buildReadme([project("alpha"), project("beta")], "2026-11-05");
  assert.match(readme, /\[\*\*alpha\*\*\]\(https:\/\/github\.com\/traique\/alpha\)/);
  assert.match(readme, /## 🚀 2 hệ thống nổi bật/);
  for (const asset of ["header", "contributions", "commits", "network", "activity", "projects"]) {
    assert.match(readme, new RegExp(`\\./assets/${asset}\\.svg`));
  }
});
