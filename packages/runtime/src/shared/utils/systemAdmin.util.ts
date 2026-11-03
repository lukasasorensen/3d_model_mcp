export function isSystemAdmin(userId: string): boolean {
  return (
    !!userId &&
    (process.env.THEORYFOUNDRY_SYSTEM_ADMIN_USER_IDS ?? "")
      .split(",")
      .some((value) => value.trim() === userId)
  );
}
