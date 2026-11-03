import fs from "fs";
import path from "path";

const root = "supabase/functions";
const sharedNeeded = {
  "compose-text": ["ai-text.ts", "firecrawl.ts", "web-sources.ts", "content-skills.ts"],
  "generate-post": ["ai-text.ts", "content-skills.ts"],
  "generate-image": ["xai-image.ts", "ai-image.ts", "ai-text.ts", "content-skills.ts"],
  "run-schedules": [
    "xai-image.ts", "ai-image.ts", "ai-text.ts", "firecrawl.ts", "web-sources.ts",
    "linkedin.ts", "cron-auth.ts", "jobs.ts", "schedule-time.ts", "logger.ts", "content-skills.ts",
  ],
  "run-topic-queue": [
    "xai-image.ts", "ai-image.ts", "ai-text.ts", "linkedin.ts", "cron-auth.ts",
    "jobs.ts", "schedule-time.ts", "logger.ts", "content-skills.ts",
  ],
};

const outDir = ".tmp-skill-deploy";
fs.mkdirSync(outDir, { recursive: true });

for (const [fn, shared] of Object.entries(sharedNeeded)) {
  const files = [
    { name: "index.ts", content: fs.readFileSync(path.join(root, fn, "index.ts"), "utf8") },
  ];
  for (const s of shared) {
    files.push({
      name: `../_shared/${s}`,
      content: fs.readFileSync(path.join(root, "_shared", s), "utf8"),
    });
  }
  const meta = {
    name: fn,
    verify_jwt: !["compose-text", "run-schedules", "run-topic-queue"].includes(fn),
    files,
  };
  fs.writeFileSync(path.join(outDir, `${fn}.json`), JSON.stringify(meta));
  console.log(fn, "files", files.length, "bytes", JSON.stringify(meta).length);
}
