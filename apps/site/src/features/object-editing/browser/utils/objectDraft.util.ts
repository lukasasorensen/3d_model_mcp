import type { ModelFiles, ProjectParameter } from "@theoryfoundry/contracts";

export function objectPreviewSources(
  files: ModelFiles["files"],
  parameters: ProjectParameter[],
): Map<string, string> {
  const header = parameters.map(
    (parameter) => `${parameter.binding} = ${JSON.stringify(parameter.value)};`,
  );
  return new Map(
    files.map((file) => [file.id, [...header, file.body].join("\n")]),
  );
}

export function sameObjectSnapshot(
  left: ModelFiles | undefined,
  right: ModelFiles | null | undefined,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right ?? undefined);
}
