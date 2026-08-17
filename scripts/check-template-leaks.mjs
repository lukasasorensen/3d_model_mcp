import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".tsx", ".yaml", ".yml"]);
const forbidden = [["resume", "-agent"].join(""), ["@resume", "-agent"].join("")];

const excludedDirectories = new Set([".git", ".next", ".omx", "dist", "node_modules"]);

async function listWorkspaceFiles(cwd) {
  const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd,
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.toString("utf8").split("\0").filter(Boolean);
}

function readErrorCode(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : "UNKNOWN";
}

export async function checkTemplateLeaks({ cwd = process.cwd(), listFiles = listWorkspaceFiles, readText = readFile } = {}) {
  const files = (await listFiles(cwd))
    .filter((file) => !file.split("/").some((part) => excludedDirectories.has(part)));

  const findings = [];
  for (const file of files) {
    const normalizedPath = file.toLowerCase();
    for (const token of forbidden) {
      if (normalizedPath.includes(token)) findings.push(`${file}: filename contains a template identity token`);
    }
    if (!textExtensions.has(extname(file)) && ![".env.example", ".npmrc"].includes(file)) continue;
    let text;
    try {
      text = (await readText(resolve(cwd, file), "utf8")).toLowerCase();
    } catch (error) {
      findings.push(`${file}: unable to read source file (${readErrorCode(error)})`);
      continue;
    }
    for (const token of forbidden) {
      if (text.includes(token)) findings.push(`${file}: content contains a template identity token`);
    }
  }
  return { files, findings };
}

export async function runTemplateLeakCheck(options = {}) {
  const { log = console.log, error = console.error, ...checkOptions } = options;
  const { files, findings } = await checkTemplateLeaks(checkOptions);
  if (findings.length > 0) {
    error(["Template identity check failed:", ...findings.map((finding) => `- ${finding}`)].join("\n"));
    return 1;
  }
  log(`Template identity check passed across ${files.length} source files.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await runTemplateLeakCheck();
}
