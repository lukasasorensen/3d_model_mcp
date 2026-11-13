export async function hiddenPrompt(
  message: string,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  if (!process.stdin.isTTY)
    throw new Error(
      "INTERACTIVE_REQUIRED: Run this backup/restore command in a terminal to enter its passphrase privately.",
    );
  process.stderr.write(message);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (): void => {
      process.stdin.off("data", read);
      signal.removeEventListener("abort", cancel);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
    };
    const cancel = (): void => {
      finish();
      reject(new Error("CANCELLED: Passphrase entry cancelled."));
    };
    const read = (chunk: Buffer): void => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          cancel();
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (char === "\u007f") value = value.slice(0, -1);
        else if (char.charCodeAt(0) >= 32 && value.length < 1024) value += char;
      }
    };
    process.stdin.on("data", read);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
