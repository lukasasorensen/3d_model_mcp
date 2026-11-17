import type { ModelFiles, ProjectParameter } from "@theoryfoundry/contracts";

/** Match OpenSCAD scalar literals without interpreting or rewriting the body. */
export function selectedObjectSource(
  files: ModelFiles | undefined,
  objectId: string | null,
  parameters: ProjectParameter[],
): string | undefined {
  const object = files?.objects.find((item) => item.id === objectId);
  const file = files?.files.find((item) => item.id === object?.fileId);
  if (!file) return undefined;
  return [
    ...parameters.map(
      (parameter) =>
        `${parameter.binding} = ${JSON.stringify(parameter.value)};`,
    ),
    file.body,
  ].join("\n");
}

export function sameObjectSnapshot(
  left: ModelFiles | undefined,
  right: ModelFiles | null | undefined,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right ?? undefined);
}
