import { spawnSync } from "node:child_process";

process.env.ANALYZE = "true";

const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
