import assert from "node:assert/strict";
import test from "node:test";
import { formatCount, renderMetricCard, renderProjectCard, type Project, type Metric } from "./render-profile.js";

test("formatCount keeps small counts exact and abbreviates large counts", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(1200), "1.2k");
  assert.equal(formatCount(1500000), "1.5M");
});

test("metric card renders self-contained animated SVG", () => {
  const metric: Metric = { label: "COMMIT", value: "42", detail: "12 tháng gần nhất" };
  const svg = renderMetricCard(metric, 260, 120);
  assert.match(svg, /COMMIT/);
  assert.match(svg, /42/);
  assert.match(svg, /@keyframes/);
  assert.match(svg, /linearGradient/);
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /https?:\/\//i);
});

test("project card escapes repository text and stays self-contained", () => {
  const project: Project = {
    name: "demo<&",
    description: "A <safe> project",
    language: "TypeScript",
    stars: 12,
    url: "https://github.com/traique/demo"
  };
  const svg = renderProjectCard(project, 720, 150);
  assert.match(svg, /demo&lt;&amp;/);
  assert.match(svg, /A &lt;safe&gt; project/);
  assert.match(svg, /12/);
  assert.match(svg, /MỞ/);
  assert.doesNotMatch(svg, /<script/i);
});
