import fs from "fs";
import path from "path";

const root = path.resolve("supabase/functions");
const outDir = path.resolve(".tmp-deploy");
fs.mkdirSync(outDir, { recursive: true });

function collect(name, relFiles, verifyJwt = true) {
  const files = relFiles.map((rel) => {
    const abs = path.normalize(path.join(root, name, rel));
    return { name: rel, content: fs.readFileSync(abs, "utf8") };
  });
  const payload = { name, entrypoint_path: "index.ts", verify_jwt: verifyJwt, files };
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(payload));
  console.log(name, files.length, "files", JSON.stringify(payload).length, "bytes");
}

collect("compose-text", ["index.ts", "../_shared/ai-text.ts", "../_shared/web-sources.ts"], true);
collect("generate-post", ["index.ts", "../_shared/ai-text.ts"], true);
collect("linkedin-oauth", ["index.ts"], true);
collect(
  "run-topic-queue",
  [
    "index.ts",
    "../_shared/ai-text.ts",
    "../_shared/ai-image.ts",
    "../_shared/xai-image.ts",
    "../_shared/jobs.ts",
    "../_shared/cron-auth.ts",
    "../_shared/logger.ts",
    "../_shared/schedule-time.ts",
    "../_shared/linkedin.ts",
  ],
  false,
);
collect(
  "run-schedules",
  [
    "index.ts",
    "../_shared/ai-text.ts",
    "../_shared/ai-image.ts",
    "../_shared/xai-image.ts",
    "../_shared/web-sources.ts",
    "../_shared/jobs.ts",
    "../_shared/cron-auth.ts",
    "../_shared/logger.ts",
    "../_shared/schedule-time.ts",
    "../_shared/linkedin.ts",
  ],
  false,
);
