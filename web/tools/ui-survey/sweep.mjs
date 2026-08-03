// Capture + detector pass over routes.json.
//
// For every route x viewport it saves a full-page screenshot and runs two
// automated checks: document-level horizontal overflow (with the first few
// offending elements named) and uncaught page errors. Clean captures print
// one quiet line; anything suspicious prints a FLAG line and the run exits
// nonzero, so this can sit in a script pipeline.
//
// Usage (normally via `npm run ui-survey` or run.sh):
//   node tools/ui-survey/sweep.mjs --routes tools/ui-survey/routes.json \
//     --cookies /tmp/cookies.json --out /tmp/ui-shots [--base http://localhost:3000]
//
// Needs the playwright devDependency plus a chromium: npx playwright install chromium
import { readFileSync, mkdirSync } from "node:fs";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const routesPath = arg("routes", "tools/ui-survey/routes.json");
const cookiesPath = arg("cookies", null);
const outDir = arg("out", "/tmp/ui-survey-shots");
const base = arg("base", "http://localhost:3000");
const only = arg("only", null); // comma-separated name filter, for quick reruns

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright is not installed. Run `npm install` in web/ (it is a devDependency), then `npx playwright install chromium`.",
  );
  process.exit(1);
}

const jobs = JSON.parse(readFileSync(routesPath, "utf8")).filter(
  (j) => !only || only.split(",").includes(j.name),
);
const cookies = cookiesPath ? JSON.parse(readFileSync(cookiesPath, "utf8")) : {};
mkdirSync(outDir, { recursive: true });

const DEFAULT_WIDTHS = [320, 390, 768, 1280];
let flags = 0;
let browser;
try {
  browser = await chromium.launch({ args: ["--no-sandbox"] });
} catch (e) {
  console.error(
    "chromium failed to launch. If this is a fresh checkout, run `npx playwright install chromium` once.\n" +
      String(e).split("\n").slice(0, 3).join("\n"),
  );
  process.exit(1);
}

for (const job of jobs) {
  for (const w of job.widths ?? DEFAULT_WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w >= 768 ? 900 : 844 } });
    if (job.role) {
      if (!cookies[job.role]) {
        console.log(`FLAG ${job.name}@${w} missing cookie for role "${job.role}" (pass --cookies)`);
        flags++;
        await ctx.close();
        continue;
      }
      await ctx.addCookies([
        { name: "authjs.session-token", value: cookies[job.role], domain: new URL(base).hostname, path: "/", httpOnly: true, sameSite: "Lax" },
      ]);
    }
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
    try {
      await page.goto(base + job.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(job.settle ?? 3500);
      const overflow = await page.evaluate(() => {
        const docOver = document.documentElement.scrollWidth - window.innerWidth;
        const wide = [];
        if (docOver > 1) {
          for (const el of document.querySelectorAll("body *")) {
            const r = el.getBoundingClientRect();
            if (r.right > window.innerWidth + 1 && r.width > 24 && el.children.length < 3) {
              wide.push(el.tagName + "." + String(el.className).split(" ")[0] + ":" + (el.textContent || "").trim().slice(0, 30));
              if (wide.length >= 3) break;
            }
          }
        }
        return { docOver, wide };
      });
      const problems = [];
      if (overflow.docOver > 1) problems.push(`overflow +${overflow.docOver}px ${JSON.stringify(overflow.wide)}`);
      if (errors.length) problems.push(`pageerror ${errors[0]}`);
      if (problems.length) {
        console.log(`FLAG ${job.name}@${w} ${problems.join(" | ")}`);
        flags++;
      } else {
        console.log(`ok   ${job.name}@${w}`);
      }
      await page.screenshot({ path: `${outDir}/${job.name}-${w}.png`, fullPage: job.fullPage !== false });
    } catch (e) {
      console.log(`FLAG ${job.name}@${w} loadfail ${String(e).slice(0, 100)}`);
      flags++;
    }
    await ctx.close();
  }
}
await browser.close();
console.log(flags === 0 ? `\nclean: ${jobs.length} routes captured with no flags` : `\n${flags} FLAG(s), see above`);
process.exit(flags === 0 ? 0 : 2);
