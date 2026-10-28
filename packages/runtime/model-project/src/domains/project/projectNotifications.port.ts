export interface ProjectNotification {
  kind: "project" | "render" | "preview";
  ownerId: string;
  projectId: string;
  jobId?: string;
}
export interface ProjectChangeSource {
  subscribe(
    listener: (event: ProjectNotification | null) => void,
  ): Promise<() => void>;
}
export interface ProjectNotifications extends ProjectChangeSource {
  close(): void;
}
