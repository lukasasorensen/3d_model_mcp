import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RendererError, boundedRedactedText } from "./diagnostics.js";
import { RENDERER_ISOLATION_LIMITS } from "@rjls/contracts";

export const RUNTIME_LIMITS = Object.freeze({
  timeoutMs: 60_000,
  memoryBytes: RENDERER_ISOLATION_LIMITS.memoryBytes,
  nanoCpus: RENDERER_ISOLATION_LIMITS.nanoCpus,
  pids: RENDERER_ISOLATION_LIMITS.pidsLimit,
  capturedBytes: 1_048_576,
});

export type EffectiveIsolationAttestation = {
  engine: string;
  mode: "rootless" | "vm-backed" | "trusted-local";
  effectiveUid: number;
  imageDigest: string;
  network: "none" | "host";
  readOnlyRoot: boolean;
  capabilitiesDropped: boolean;
  noNewPrivileges: boolean;
  inputReadOnly: boolean;
  outputIsolated: boolean;
  resourceLimitsEnforced: boolean;
  seccompEnforced: boolean;
  memoryBytes: number;
  nanoCpus: number;
  pids: number;
  openscadVersion: string;
  openscadBinaryHash: string;
  openscadHelpHash: string;
  bosl2Version: string;
  bosl2Digest: string;
  policyEvidenceHash?: string;
  cgroupV2Evidence?: CgroupV2Evidence;
  containerEvidence?: readonly SameContainerIsolationEvidence[];
};

export type EffectiveContainerPolicyEvidence = {
  policyEvidenceHash: string;
  containerId: string;
  memoryBytes: number;
  nanoCpus: number;
  pids: number;
};

export type CgroupV2Evidence = {
  version: "v2";
  controllers: readonly string[];
  memoryMax: string;
  pidsMax: string;
  cpuMax: string;
};

export type SameContainerIsolationEvidence = {
  containerId: string;
  hostname: string;
  cgroupPath: string;
  effectiveUid: number;
  cgroupV2Evidence: CgroupV2Evidence;
};

export type EffectiveIsolationProbeEvidence = EffectiveContainerPolicyEvidence & { effectiveUid: number; cgroupV2Evidence: CgroupV2Evidence; sameContainerEvidence: SameContainerIsolationEvidence };

export interface IsolationProbeRequest {
  image: string;
  imageDigest: string;
  bosl2HostPath: string;
  timeoutMs?: number;
}

export interface RuntimeJob {
  source: string;
  image: string;
  imageDigest: string;
  bosl2HostPath: string;
  openscadVersion: string;
  openscadBinaryHash: string;
  openscadHelpHash: string;
  bosl2Version: string;
  bosl2Digest: string;
  formats: readonly ["stl", "3mf"];
  timeoutMs: number;
}

export interface RuntimeResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  artifacts: ReadonlyMap<"stl" | "3mf", Uint8Array>;
  attestation: EffectiveIsolationAttestation;
}

export interface OciRuntimeController {
  readonly profile: "production-oci" | "trusted-local-development";
  readonly configuredLimits: Readonly<{ memoryBytes: number; nanoCpus: number; pids: number }>;
  execute(job: RuntimeJob, signal?: AbortSignal): Promise<RuntimeResult>;
  probeEffectiveIsolation?(request: IsolationProbeRequest, signal?: AbortSignal): Promise<EffectiveIsolationProbeEvidence>;
}

export interface OciCreatePlan {
  inputPath: string;
  bosl2Path: string;
  image: string;
  format: "stl" | "3mf";
}

export function buildOciCreateArguments(plan: OciCreatePlan): readonly string[] {
  const filename = plan.format === "stl" ? "preview.stl" : "export.3mf";
  const exportFormat = plan.format === "stl" ? "binstl" : "3mf";
  return [...buildOciIsolationArguments(plan), plan.image, "/bin/sh", "-ceu", ISOLATION_WRAPPER_SCRIPT, "rjls-wrapper", "/usr/bin/openscad", "-o", `/job/output/${filename}`, "--export-format", exportFormat, "/job/input/model.scad"];
}

export function buildOciProbeArguments(plan: Omit<OciCreatePlan, "format">): readonly string[] {
  return [...buildOciIsolationArguments(plan), plan.image, "/bin/sh", "-ceu", ISOLATION_WRAPPER_SCRIPT, "rjls-wrapper"];
}

const ISOLATION_EVIDENCE_PATH = "/job/output/.rjls-isolation-evidence";
const ISOLATION_WRAPPER_SCRIPT = `umask 077
{
  printf 'uid='; /usr/bin/id -u
  printf 'hostname='; /bin/cat /etc/hostname
  printf 'cgroup='; /bin/cat /proc/self/cgroup
  printf 'controllers='; /bin/cat /sys/fs/cgroup/cgroup.controllers
  printf 'memory_max='; /bin/cat /sys/fs/cgroup/memory.max
  printf 'pids_max='; /bin/cat /sys/fs/cgroup/pids.max
  printf 'cpu_max='; /bin/cat /sys/fs/cgroup/cpu.max
} > ${ISOLATION_EVIDENCE_PATH}
if [ "$#" -gt 0 ]; then exec "$@"; fi`;

function buildOciIsolationArguments(plan: Omit<OciCreatePlan, "format">): readonly string[] {
  return ["create", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--security-opt=seccomp=builtin", `--memory=${RUNTIME_LIMITS.memoryBytes}`, `--cpus=${RUNTIME_LIMITS.nanoCpus / 1e9}`, `--pids-limit=${RUNTIME_LIMITS.pids}`, "--user=65532:65532", `--mount=type=bind,src=${plan.inputPath},dst=/job/input,readonly`, `--mount=type=tmpfs,dst=/job/output,tmpfs-size=${25 * 1024 * 1024},tmpfs-mode=0777`, `--mount=type=bind,src=${plan.bosl2Path},dst=/opt/openscad/libraries/BOSL2,readonly`, "--env=OPENSCADPATH=/opt/openscad/libraries"];
}

type InspectedContainer = {
  Id?: string;
  Config?: { User?: string; Image?: string };
  HostConfig?: Record<string, unknown>;
  Mounts?: Array<Record<string, unknown>>;
};

function exactStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && new Set(actual).size === actual.length && expected.every((value) => actual.includes(value));
}

/** Validates observed OCI state; requested create flags are never treated as enforcement evidence. */
export function inspectEffectiveContainerPolicy(item: InspectedContainer | undefined, expected: { image: string; inputPath: string; bosl2Path: string }): EffectiveContainerPolicyEvidence {
  const host = item?.HostConfig;
  const mounts = item?.Mounts ?? [];
  const security = Array.isArray(host?.SecurityOpt) ? host.SecurityOpt.map((value) => String(value).trim().toLowerCase()) : [];
  const capDrop = Array.isArray(host?.CapDrop) ? host.CapDrop.map((value) => String(value).trim().toUpperCase()) : [];
  const noNewPrivileges = security.filter((value) => value.startsWith("no-new-privileges")).map((value) => value === "no-new-privileges:true" || value === "no-new-privileges=true" ? "no-new-privileges" : value);
  const seccomp = security.filter((value) => value.startsWith("seccomp"));
  const configuredMounts = Array.isArray(host?.Mounts) ? host.Mounts as Array<Record<string, unknown>> : [];
  const expectedMounts = [
    { destination: "/job/input", source: expected.inputPath, type: "bind", rw: false },
    { destination: "/opt/openscad/libraries/BOSL2", source: expected.bosl2Path, type: "bind", rw: false },
  ] as const;
  const bindMountsMatch = expectedMounts.every((expectedMount) => {
    const mount = mounts.find((candidate) => candidate.Destination === expectedMount.destination);
    return mount?.Type === expectedMount.type && mount.Source === expectedMount.source && mount.RW === expectedMount.rw;
  });
  const outputMount = mounts.find((candidate) => candidate.Destination === "/job/output");
  const dockerTmpfs = configuredMounts.find((candidate) => candidate.Type === "tmpfs" && candidate.Target === "/job/output");
  const dockerTmpfsOptions = dockerTmpfs?.TmpfsOptions as Record<string, unknown> | undefined;
  const dockerOptionsMatch = configuredMounts.length === 3
    && dockerTmpfs?.Source === undefined
    && dockerTmpfs?.ReadOnly === false
    && Number(dockerTmpfsOptions?.SizeBytes) === 25 * 1024 * 1024
    && Number(dockerTmpfsOptions?.Mode) === 0o777;
  const observedOptions = Array.isArray(outputMount?.Options)
    ? outputMount.Options.map(String)
    : typeof outputMount?.Mode === "string" && outputMount.Mode.length > 0 ? outputMount.Mode.split(",") : [];
  const engineOptionsMatch = exactStringSet(observedOptions.map((value) => value.trim()).filter(Boolean), ["rw", `size=${25 * 1024 * 1024}`, "mode=0777"]);
  const outputMountMatch = outputMount?.Type === "tmpfs"
    && (outputMount.Source === "" || outputMount.Source === "tmpfs")
    && outputMount.RW === true
    && (dockerOptionsMatch || engineOptionsMatch);
  const memoryBytes = Number(host?.Memory);
  const nanoCpus = Number(host?.NanoCpus);
  const pids = Number(host?.PidsLimit);
  const containerId = item?.Id ?? "";
  const effective = /^[a-f0-9]{64}$/.test(containerId)
    && item?.Config?.Image === expected.image
    && item.Config.User === "65532:65532"
    && host?.NetworkMode === "none"
    && host?.ReadonlyRootfs === true
    && memoryBytes === RUNTIME_LIMITS.memoryBytes
    && nanoCpus === RUNTIME_LIMITS.nanoCpus
    && pids === RUNTIME_LIMITS.pids
    && exactStringSet(capDrop, ["ALL"])
    && exactStringSet(noNewPrivileges, ["no-new-privileges"])
    && exactStringSet(seccomp, ["seccomp=builtin"])
    && mounts.length === 3
    && bindMountsMatch
    && outputMountMatch;
  if (!effective) throw new RendererError("ISOLATION_UNAVAILABLE", "Observed container isolation does not satisfy the production policy.");
  const evidence = JSON.stringify({ containerId, image: item?.Config?.Image, user: item?.Config?.User, network: host?.NetworkMode, readonlyRootfs: host?.ReadonlyRootfs, memoryBytes, nanoCpus, pids, capDrop, security, mounts: mounts.map((mount) => ({ type: mount.Type, source: mount.Source, destination: mount.Destination, rw: mount.RW, mode: mount.Mode, options: mount.Options })), configuredMounts });
  return { policyEvidenceHash: `sha256:${createHash("sha256").update(evidence).digest("hex")}`, containerId, memoryBytes, nanoCpus, pids };
}

export function parseCgroupV2Evidence(observed: { controllers: string; memoryMax: string; pidsMax: string; cpuMax: string }): CgroupV2Evidence {
  if (Object.values(observed).some((value) => Buffer.byteLength(value, "utf8") > 4096)) throw new RendererError("ISOLATION_UNAVAILABLE", "Cgroup evidence exceeds its bounded format.");
  const controllers = observed.controllers.trim().split(/\s+/).filter(Boolean).sort();
  if (controllers.length === 0 || controllers.length > 64 || controllers.some((name, index) => !/^[a-z][a-z0-9_-]{0,31}$/.test(name) || name === controllers[index - 1])) throw new RendererError("ISOLATION_UNAVAILABLE", "Cgroup v2 controller evidence is malformed.");
  if (!["cpu", "memory", "pids"].every((controller) => controllers.includes(controller))) throw new RendererError("ISOLATION_UNAVAILABLE", "Required cgroup v2 controllers are unavailable.");
  const memoryMax = observed.memoryMax.trim();
  const pidsMax = observed.pidsMax.trim();
  const cpuMax = observed.cpuMax.trim();
  if (memoryMax !== String(RUNTIME_LIMITS.memoryBytes) || pidsMax !== String(RUNTIME_LIMITS.pids)) throw new RendererError("ISOLATION_UNAVAILABLE", "Observed cgroup memory or process limits do not match policy.");
  const cpuParts = cpuMax.split(/\s+/);
  const quota = Number(cpuParts[0]);
  const period = Number(cpuParts[1]);
  if (cpuParts.length !== 2 || !Number.isSafeInteger(quota) || !Number.isSafeInteger(period) || quota <= 0 || period <= 0 || quota > 1_000_000_000 || period > 1_000_000_000 || quota * 1_000_000_000 !== period * RUNTIME_LIMITS.nanoCpus) throw new RendererError("ISOLATION_UNAVAILABLE", "Observed cgroup CPU limit does not match policy.");
  return { version: "v2", controllers, memoryMax, pidsMax, cpuMax: `${quota} ${period}` };
}

export function parseSameContainerIsolationEvidence(text: string, inspectedContainerId: string): SameContainerIsolationEvidence {
  if (Buffer.byteLength(text, "utf8") > 8192 || !/^[a-f0-9]{64}$/.test(inspectedContainerId)) throw new RendererError("ISOLATION_UNAVAILABLE", "Same-container isolation evidence is malformed.");
  const lines = text.trim().split("\n");
  if (lines.length !== 7) throw new RendererError("ISOLATION_UNAVAILABLE", "Same-container isolation evidence is incomplete.");
  const values = new Map(lines.map((line) => { const split = line.indexOf("="); return [line.slice(0, split), line.slice(split + 1)] as const; }));
  if (values.size !== 7 || [...values.keys()].some((key) => !["uid", "hostname", "cgroup", "controllers", "memory_max", "pids_max", "cpu_max"].includes(key))) throw new RendererError("ISOLATION_UNAVAILABLE", "Same-container isolation evidence contains unexpected fields.");
  const effectiveUid = Number(values.get("uid"));
  const hostname = values.get("hostname") ?? "";
  const cgroupRecord = values.get("cgroup") ?? "";
  if (effectiveUid !== 65532 || !/^[a-f0-9]{12,64}$/.test(hostname) || !inspectedContainerId.startsWith(hostname)) throw new RendererError("ISOLATION_UNAVAILABLE", "In-container identity does not match the inspected container.");
  const cgroupMatch = cgroupRecord.match(/^0::(\S+)$/);
  if (!cgroupMatch) throw new RendererError("ISOLATION_UNAVAILABLE", "The container is not using an identifiable cgroup v2 path.");
  const cgroupPath = cgroupMatch[1]!;
  const cgroupV2Evidence = parseCgroupV2Evidence({ controllers: values.get("controllers") ?? "", memoryMax: values.get("memory_max") ?? "", pidsMax: values.get("pids_max") ?? "", cpuMax: values.get("cpu_max") ?? "" });
  return { containerId: inspectedContainerId, hostname, cgroupPath, effectiveUid, cgroupV2Evidence };
}

export function bindPolicyEvidence(inspectHash: string, evidence: SameContainerIsolationEvidence): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(inspectHash)) throw new RendererError("ISOLATION_UNAVAILABLE", "Container inspect evidence is missing.");
  return `sha256:${createHash("sha256").update(JSON.stringify({ inspectHash, evidence })).digest("hex")}`;
}

export function assertStartedOperationEvidence(startedOperations: number, evidenceCount: number): void {
  if (!Number.isInteger(startedOperations) || startedOperations < 1 || evidenceCount !== startedOperations) throw new RendererError("ISOLATION_UNAVAILABLE", "Every started render operation requires same-container isolation evidence.");
}

export function finalizeAttestedRuntimeResult(result: RuntimeResult, startedOperations: number, evidenceCount: number): RuntimeResult {
  assertStartedOperationEvidence(startedOperations, evidenceCount);
  return result;
}

function remainingTimeout(deadline: number, maximum: number = RUNTIME_LIMITS.timeoutMs): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new RendererError("TIMEOUT", "Rendering exceeded the absolute wall-clock limit.");
  return Math.min(remaining, maximum);
}

function abortError(signal: AbortSignal): RendererError {
  return signal.reason instanceof RendererError ? signal.reason : new RendererError("CANCELLED", "Rendering was cancelled.");
}

export async function settleCleanupWithinDeadline(operation: Promise<unknown>, deadline: number): Promise<void> {
  const settled = operation.then(() => undefined, () => undefined);
  const remaining = deadline - Date.now();
  if (remaining <= 0) { void settled; return; }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, remaining);
    settled.then(() => { clearTimeout(timer); resolve(); });
  });
}

function createOperationDeadline(timeoutMs: number, externalSignal?: AbortSignal) {
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new RendererError("TIMEOUT", "Rendering exceeded the absolute wall-clock limit.")), timeoutMs);
  const signal = externalSignal ? AbortSignal.any([externalSignal, controller.signal]) : controller.signal;
  const foreground = async <T>(operation: Promise<T>): Promise<T> => {
    if (signal.aborted) throw abortError(signal);
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(abortError(signal));
      signal.addEventListener("abort", onAbort, { once: true });
      operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
  };
  const cleanup = async (operation: Promise<unknown>): Promise<void> => {
    await settleCleanupWithinDeadline(operation, deadline);
  };
  return { deadline, signal, foreground, cleanup, dispose: () => clearTimeout(timer) };
}

export async function attestBosl2Tree(root: string, expectedVersion: string, signal?: AbortSignal): Promise<{ version: string; digest: string }> {
  const checkAbort = () => { if (signal?.aborted) throw abortError(signal); };
  const hash = createHash("sha256");
  async function visit(directory: string, prefix = ""): Promise<void> {
    checkAbort();
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
      checkAbort();
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      const metadata = await lstat(absolute);
      checkAbort();
      if (metadata.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new RendererError("INTEGRITY_FAILURE", "BOSL2 tree contains an unsupported filesystem entry.");
      hash.update(entry.isDirectory() ? "D\0" : "F\0").update(relative).update("\0");
      if (entry.isDirectory()) await visit(absolute, relative);
      else { hash.update(await readFile(absolute)).update("\0"); checkAbort(); }
    }
  }
  await visit(root);
  const versionSource = await readFile(join(root, "version.scad"), "utf8").catch(() => "");
  checkAbort();
  const versionParts = versionSource.match(/BOSL_VERSION\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/)?.slice(1);
  const version = versionParts ? `v${versionParts.join(".")}` : "";
  if (version !== expectedVersion) throw new RendererError("INTEGRITY_FAILURE", "BOSL2 version evidence does not match the configured pin.");
  return { version, digest: `sha256:${hash.digest("hex")}` };
}

export type CommandResult = { code: number | null; stdout: string; stderr: string };

export async function runBoundedCommand(executable: string, args: readonly string[], signal?: AbortSignal, timeoutMs: number = RUNTIME_LIMITS.timeoutMs): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env: { PATH: "/usr/local/bin:/usr/bin:/bin" }, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let settled = false;
    const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>) => current.byteLength > RUNTIME_LIMITS.capturedBytes ? current : Buffer.concat([current, chunk]).subarray(0, RUNTIME_LIMITS.capturedBytes + 1);
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const kill = () => {
      if (!child.pid) return;
      try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    };
    const finishError = (error: RendererError) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", onAbort); kill(); reject(error); };
    const timer = setTimeout(() => { finishError(new RendererError("TIMEOUT", "Rendering exceeded the absolute wall-clock limit.")); }, timeoutMs);
    const onAbort = () => { finishError(signal ? abortError(signal) : new RendererError("CANCELLED", "Rendering was cancelled.")); };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    child.once("error", (error) => { finishError(new RendererError("ISOLATION_UNAVAILABLE", "The isolated container runtime is unavailable.", { cause: (error as NodeJS.ErrnoException).code ?? "SPAWN_FAILED" })); });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ code, stdout: boundedRedactedText(stdout.toString("utf8")), stderr: boundedRedactedText(stderr.toString("utf8")) });
    });
  });
}

const command = runBoundedCommand;

/** Opt-in convenience adapter for trusted source during local development. It provides no isolation. */
export class TrustedLocalOpenScadRuntime implements OciRuntimeController {
  readonly profile = "trusted-local-development" as const;
  readonly configuredLimits = Object.freeze({ memoryBytes: 0, nanoCpus: 0, pids: 0 });
  constructor(private readonly executable: string, private readonly warn: (message: string) => void = console.warn) {}

  async execute(job: RuntimeJob, signal?: AbortSignal): Promise<RuntimeResult> {
    this.warn("WARNING: trusted-local-development renderer is NON-ISOLATED; never use it for untrusted input or production promotion.");
    const operation = createOperationDeadline(job.timeoutMs, signal);
    let root: string | undefined;
    try {
      root = await operation.foreground(mkdtemp(join(tmpdir(), "rjls-trusted-local-render-")));
      const sourcePath = join(root, "model.scad");
      await operation.foreground(writeFile(sourcePath, job.source, { mode: 0o400 }));
      const artifacts = new Map<"stl" | "3mf", Uint8Array>();
      let stdout = "";
      let stderr = "";
      let exitCode: number | null = 0;
      for (const format of job.formats) {
        const outputPath = join(root, format === "stl" ? "preview.stl" : "export.3mf");
        const result = await command(this.executable, ["-I", job.bosl2HostPath, "-o", outputPath, "--export-format", format === "stl" ? "binstl" : "3mf", sourcePath], operation.signal, remainingTimeout(operation.deadline));
        stdout = boundedRedactedText(`${stdout}${result.stdout}`);
        stderr = boundedRedactedText(`${stderr}${result.stderr}`);
        exitCode = result.code;
        if (result.code !== 0) break;
        artifacts.set(format, await operation.foreground(readFile(outputPath)));
      }
      return { exitCode, stdout, stderr, artifacts, attestation: { engine: "trusted-local-openscad", mode: "trusted-local", effectiveUid: typeof process.getuid === "function" ? process.getuid() : 1, imageDigest: job.imageDigest, network: "host", readOnlyRoot: false, capabilitiesDropped: false, noNewPrivileges: false, inputReadOnly: false, outputIsolated: false, resourceLimitsEnforced: false, seccompEnforced: false, memoryBytes: 0, nanoCpus: 0, pids: 0, openscadVersion: job.openscadVersion, openscadBinaryHash: job.openscadBinaryHash, openscadHelpHash: job.openscadHelpHash, bosl2Version: job.bosl2Version, bosl2Digest: job.bosl2Digest } };
    } finally {
      if (root) await operation.cleanup(rm(root, { recursive: true, force: true }));
      operation.dispose();
    }
  }
}

/** Concrete fail-closed Docker/Podman adapter. It inspects the created container rather than trusting requested flags. */
export class OciCliRuntime implements OciRuntimeController {
  readonly profile = "production-oci" as const;
  readonly configuredLimits = Object.freeze({ memoryBytes: RUNTIME_LIMITS.memoryBytes, nanoCpus: RUNTIME_LIMITS.nanoCpus, pids: RUNTIME_LIMITS.pids });
  constructor(private readonly executable: "docker" | "podman", private readonly mode: "rootless" | "vm-backed") {}

  /** Controller-owned readiness probe. The fixed wrapper records same-container isolation evidence and never loads model source. */
  async probeEffectiveIsolation(request: IsolationProbeRequest, signal?: AbortSignal): Promise<EffectiveIsolationProbeEvidence> {
    if (!/^sha256:[a-f0-9]{64}$/.test(request.imageDigest) || request.image !== `${request.image.split("@")[0]}@${request.imageDigest}`) throw new RendererError("INTEGRITY_FAILURE", "Probe image must be selected by an exact SHA-256 digest.");
    const operation = createOperationDeadline(Math.min(request.timeoutMs ?? 15_000, RUNTIME_LIMITS.timeoutMs), signal);
    let root: string | undefined;
    let containerId = "";
    try {
      root = await operation.foreground(mkdtemp(join(tmpdir(), "rjls-isolation-probe-")));
      const input = join(root, "input");
      await operation.foreground(mkdir(input));
      const engineInfo = await command(this.executable, ["info", "--format", "{{json .}}"], operation.signal, remainingTimeout(operation.deadline, 15_000));
      const info = JSON.parse(engineInfo.stdout) as { SecurityOptions?: string[]; OperatingSystem?: string };
      const rootless = (info.SecurityOptions ?? []).some((value) => value.toLowerCase().includes("rootless"));
      const vmBacked = /docker desktop|podman machine/i.test(info.OperatingSystem ?? "");
      if ((this.mode === "rootless" && !rootless) || (this.mode === "vm-backed" && !vmBacked)) throw new RendererError("ISOLATION_UNAVAILABLE", "The container engine mode is not effectively rootless or VM-backed.");
      const imageInspect = await command(this.executable, ["image", "inspect", request.image], operation.signal, remainingTimeout(operation.deadline, 15_000));
      const imageRecords = JSON.parse(imageInspect.stdout) as Array<{ RepoDigests?: string[] }>;
      if (!(imageRecords[0]?.RepoDigests ?? []).includes(request.image)) throw new RendererError("INTEGRITY_FAILURE", "The local image does not attest the configured repository digest.");
      const created = await command(this.executable, buildOciProbeArguments({ inputPath: input, bosl2Path: request.bosl2HostPath, image: request.image }), operation.signal, remainingTimeout(operation.deadline, 15_000));
      if (created.code !== 0 || !/^[a-f0-9]{12,64}$/i.test(created.stdout.trim())) throw new RendererError("ISOLATION_UNAVAILABLE", "Isolation probe container could not be created.");
      containerId = created.stdout.trim();
      const inspected = await command(this.executable, ["inspect", containerId], operation.signal, remainingTimeout(operation.deadline, 15_000));
      const records = JSON.parse(inspected.stdout) as InspectedContainer[];
      const evidence = inspectEffectiveContainerPolicy(records[0], { image: request.image, inputPath: input, bosl2Path: request.bosl2HostPath });
      if (!(evidence.containerId === containerId || evidence.containerId.startsWith(containerId))) throw new RendererError("ISOLATION_UNAVAILABLE", "Created and inspected readiness container identities disagree.");
      const started = await command(this.executable, ["start", "--attach", containerId], operation.signal, remainingTimeout(operation.deadline, 15_000));
      if (started.code !== 0) throw new RendererError("ISOLATION_UNAVAILABLE", "Isolation probe wrapper failed.");
      const evidencePath = join(root, "isolation-evidence");
      const copied = await command(this.executable, ["cp", `${containerId}:${ISOLATION_EVIDENCE_PATH}`, evidencePath], operation.signal, remainingTimeout(operation.deadline, 15_000));
      if (copied.code !== 0) throw new RendererError("ISOLATION_UNAVAILABLE", "Same-container readiness evidence is missing.");
      const sameContainer = parseSameContainerIsolationEvidence(await operation.foreground(readFile(evidencePath, "utf8")), evidence.containerId);
      return { ...evidence, policyEvidenceHash: bindPolicyEvidence(evidence.policyEvidenceHash, sameContainer), effectiveUid: sameContainer.effectiveUid, cgroupV2Evidence: sameContainer.cgroupV2Evidence, sameContainerEvidence: sameContainer };
    } finally {
      if (containerId) await operation.cleanup(command(this.executable, ["rm", "--force", containerId], undefined, 15_000));
      if (root) await operation.cleanup(rm(root, { recursive: true, force: true }));
      operation.dispose();
    }
  }

  async execute(job: RuntimeJob, signal?: AbortSignal): Promise<RuntimeResult> {
    const operation = createOperationDeadline(job.timeoutMs, signal);
    let root: string | undefined;
    try {
      if (!/^sha256:[a-f0-9]{64}$/.test(job.imageDigest) || job.image !== `${job.image.split("@")[0]}@${job.imageDigest}`) throw new RendererError("INTEGRITY_FAILURE", "The OpenSCAD image must be selected by an exact SHA-256 digest.");
      for (const value of [job.openscadBinaryHash, job.openscadHelpHash, job.bosl2Digest]) if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new RendererError("INTEGRITY_FAILURE", "Toolchain evidence must use exact SHA-256 pins.");
      const bosl2Evidence = await operation.foreground(attestBosl2Tree(job.bosl2HostPath, job.bosl2Version, operation.signal));
      if (bosl2Evidence.digest !== job.bosl2Digest) throw new RendererError("INTEGRITY_FAILURE", "Mounted BOSL2 content does not match the configured digest.");
      root = await operation.foreground(mkdtemp(join(tmpdir(), "rjls-render-")));
      const jobRoot = root;
      const input = join(root, "input");
      const outputs = { stl: join(root, "output-stl"), "3mf": join(root, "output-3mf") } as const;
      await operation.foreground(mkdir(input));
      await operation.foreground(mkdir(outputs.stl));
      await operation.foreground(mkdir(outputs["3mf"]));
      await operation.foreground(writeFile(join(input, "model.scad"), job.source, { mode: 0o400 }));
      const artifacts = new Map<"stl" | "3mf", Uint8Array>();
      const engineInfo = await command(this.executable, ["info", "--format", "{{json .}}"], operation.signal, remainingTimeout(operation.deadline, 15_000));
      const info = JSON.parse(engineInfo.stdout) as { SecurityOptions?: string[]; OperatingSystem?: string };
      const rootless = (info.SecurityOptions ?? []).some((value) => value.toLowerCase().includes("rootless"));
      const vmBacked = /docker desktop|podman machine/i.test(info.OperatingSystem ?? "");
      if ((this.mode === "rootless" && !rootless) || (this.mode === "vm-backed" && !vmBacked)) throw new RendererError("ISOLATION_UNAVAILABLE", "The container engine mode is not effectively rootless or VM-backed.");
      const imageInspect = await command(this.executable, ["image", "inspect", job.image], operation.signal, remainingTimeout(operation.deadline, 15_000));
      const imageRecords = JSON.parse(imageInspect.stdout) as Array<{ RepoDigests?: string[] }>;
      if (!(imageRecords[0]?.RepoDigests ?? []).includes(job.image)) throw new RendererError("INTEGRITY_FAILURE", "The local image does not attest the configured repository digest.");
      let effectiveBinaryHash = "";
      const probe = async (executable: string, args: readonly string[], copyBinary = false): Promise<CommandResult> => {
        let containerId = "";
        try {
          const created = await command(this.executable, ["create", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--security-opt=seccomp=builtin", `--memory=${RUNTIME_LIMITS.memoryBytes}`, `--cpus=${RUNTIME_LIMITS.nanoCpus / 1e9}`, `--pids-limit=${RUNTIME_LIMITS.pids}`, "--user=65532:65532", job.image, executable, ...args], operation.signal, remainingTimeout(operation.deadline, 15_000));
          if (created.code !== 0 || !/^[a-f0-9]{12,64}$/i.test(created.stdout.trim())) throw new RendererError("INTEGRITY_FAILURE", "OpenSCAD evidence container could not be created.");
          containerId = created.stdout.trim();
          const result = await command(this.executable, ["start", "--attach", containerId], operation.signal, remainingTimeout(operation.deadline, 15_000));
          if (result.code !== 0) throw new RendererError("INTEGRITY_FAILURE", `Runtime evidence command ${executable} failed.`);
          if (copyBinary) {
            const binaryPath = join(jobRoot, "openscad.bin");
            const copied = await command(this.executable, ["cp", `${containerId}:/usr/bin/openscad`, binaryPath], operation.signal, remainingTimeout(operation.deadline, 15_000));
            if (copied.code !== 0) throw new RendererError("INTEGRITY_FAILURE", "OpenSCAD binary evidence could not be copied from the pinned image.");
            effectiveBinaryHash = `sha256:${createHash("sha256").update(await operation.foreground(readFile(binaryPath))).digest("hex")}`;
            if (effectiveBinaryHash !== job.openscadBinaryHash) throw new RendererError("INTEGRITY_FAILURE", "OpenSCAD binary does not match the configured hash.");
          }
          return result;
        } finally {
          if (containerId) await operation.cleanup(command(this.executable, ["rm", "--force", containerId], undefined, 15_000));
        }
      };
      const versionEvidence = await probe("/usr/bin/openscad", ["--version"], true);
      const effectiveVersion = `${versionEvidence.stdout}\n${versionEvidence.stderr}`.match(/OpenSCAD\s+version\s+([^\s]+)/i)?.[1];
      if (effectiveVersion !== job.openscadVersion) throw new RendererError("INTEGRITY_FAILURE", "OpenSCAD version evidence does not match the configured version.");
      const helpEvidence = await probe("/usr/bin/openscad", ["--help"]);
      const helpHash = `sha256:${createHash("sha256").update(`${helpEvidence.stdout}${helpEvidence.stderr}`).digest("hex")}`;
      if (helpHash !== job.openscadHelpHash) throw new RendererError("INTEGRITY_FAILURE", "OpenSCAD help evidence does not match the configured hash.");
      let combinedStdout = "";
      let combinedStderr = "";
      let exitCode: number | null = 0;
      const policyEvidenceHashes: string[] = [];
      const containerEvidence: SameContainerIsolationEvidence[] = [];
      let startedOperations = 0;
      let effectiveBosl2Evidence: { version: string; digest: string } | undefined;
      const inspectContainerPolicy = async (containerId: string): Promise<EffectiveContainerPolicyEvidence> => {
        const inspected = await command(this.executable, ["inspect", containerId], operation.signal, remainingTimeout(operation.deadline, 15_000));
        const record = JSON.parse(inspected.stdout) as Array<Record<string, unknown>>;
        const evidence = inspectEffectiveContainerPolicy(record[0] as InspectedContainer | undefined, { image: job.image, inputPath: input, bosl2Path: job.bosl2HostPath });
        if (!(evidence.containerId === containerId || evidence.containerId.startsWith(containerId))) throw new RendererError("ISOLATION_UNAVAILABLE", "Created and inspected render container identities disagree.");
        return evidence;
      };
      for (const format of job.formats) {
        let containerId = "";
        try {
          const createArgs = buildOciCreateArguments({ inputPath: input, bosl2Path: job.bosl2HostPath, image: job.image, format });
          const created = await command(this.executable, createArgs, operation.signal, remainingTimeout(operation.deadline, 15_000));
          if (created.code !== 0) throw new RendererError("ISOLATION_UNAVAILABLE", "The isolated render container could not be created.");
          containerId = created.stdout.trim();
          if (!/^[a-f0-9]{12,64}$/i.test(containerId)) throw new RendererError("ISOLATION_UNAVAILABLE", "The container runtime returned an invalid container identifier.");
          const before = await inspectContainerPolicy(containerId);
          const started = await command(this.executable, ["start", "--attach", containerId], operation.signal, remainingTimeout(operation.deadline));
          startedOperations += 1;
          const after = await inspectContainerPolicy(containerId);
          if (before.containerId !== after.containerId || before.policyEvidenceHash !== after.policyEvidenceHash) throw new RendererError("ISOLATION_UNAVAILABLE", "Render container policy changed during execution.");
          combinedStdout = boundedRedactedText(`${combinedStdout}${started.stdout}`);
          combinedStderr = boundedRedactedText(`${combinedStderr}${started.stderr}`);
          exitCode = started.code;
          const isolationEvidencePath = join(jobRoot, `isolation-${format}.txt`);
          const copiedIsolation = await command(this.executable, ["cp", `${containerId}:${ISOLATION_EVIDENCE_PATH}`, isolationEvidencePath], operation.signal, remainingTimeout(operation.deadline, 15_000));
          if (copiedIsolation.code !== 0) throw new RendererError("ISOLATION_UNAVAILABLE", "Same-container render evidence is missing.");
          const sameContainer = parseSameContainerIsolationEvidence(await operation.foreground(readFile(isolationEvidencePath, "utf8")), after.containerId);
          containerEvidence.push(sameContainer);
          policyEvidenceHashes.push(bindPolicyEvidence(after.policyEvidenceHash, sameContainer));
          if (started.code !== 0) break;
          if (!effectiveBosl2Evidence) {
            const effectiveBosl2Path = join(jobRoot, "effective-bosl2");
            const copiedBosl2 = await command(this.executable, ["cp", `${containerId}:/opt/openscad/libraries/BOSL2/.`, effectiveBosl2Path], operation.signal, remainingTimeout(operation.deadline, 15_000));
            if (copiedBosl2.code !== 0) throw new RendererError("INTEGRITY_FAILURE", "Effective BOSL2 mount evidence could not be copied from the running container.");
            effectiveBosl2Evidence = await operation.foreground(attestBosl2Tree(effectiveBosl2Path, job.bosl2Version, operation.signal));
            if (effectiveBosl2Evidence.digest !== job.bosl2Digest) throw new RendererError("INTEGRITY_FAILURE", "Effective BOSL2 mount does not match the configured digest.");
          }
          const filename = format === "stl" ? "preview.stl" : "export.3mf";
          const artifactPath = join(outputs[format], filename);
          const copied = await command(this.executable, ["cp", `${containerId}:/job/output/${filename}`, artifactPath], operation.signal, remainingTimeout(operation.deadline, 15_000));
          if (copied.code !== 0) throw new RendererError("INVALID_ARTIFACT", "The required render output is missing.");
          const size = (await operation.foreground(stat(artifactPath))).size;
          const limit = format === "stl" ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
          if (size > limit) throw new RendererError("RESOURCE_LIMIT", "Rendered output exceeds its byte budget.");
          artifacts.set(format, await operation.foreground(readFile(artifactPath)));
        } finally {
          if (containerId) await operation.cleanup(command(this.executable, ["rm", "--force", containerId], undefined, 15_000));
        }
      }
      assertStartedOperationEvidence(startedOperations, containerEvidence.length);
      assertStartedOperationEvidence(startedOperations, policyEvidenceHashes.length);
      const policyEvidenceHash = `sha256:${createHash("sha256").update(JSON.stringify(policyEvidenceHashes)).digest("hex")}`;
      return finalizeAttestedRuntimeResult({ exitCode, stdout: combinedStdout, stderr: combinedStderr, artifacts, attestation: { engine: this.executable, mode: this.mode, effectiveUid: containerEvidence[0]!.effectiveUid, imageDigest: job.imageDigest, network: "none", readOnlyRoot: true, capabilitiesDropped: true, noNewPrivileges: true, inputReadOnly: true, outputIsolated: true, resourceLimitsEnforced: true, seccompEnforced: true, memoryBytes: RUNTIME_LIMITS.memoryBytes, nanoCpus: RUNTIME_LIMITS.nanoCpus, pids: RUNTIME_LIMITS.pids, openscadVersion: effectiveVersion, openscadBinaryHash: effectiveBinaryHash, openscadHelpHash: helpHash, bosl2Version: effectiveBosl2Evidence?.version ?? bosl2Evidence.version, bosl2Digest: effectiveBosl2Evidence?.digest ?? bosl2Evidence.digest, policyEvidenceHash, cgroupV2Evidence: containerEvidence[0]!.cgroupV2Evidence, containerEvidence } }, startedOperations, containerEvidence.length);
    } finally {
      if (root) await operation.cleanup(rm(root, { recursive: true, force: true }));
      operation.dispose();
    }
  }
}
