export const CHAT_LIMITS = Object.freeze({
  requestBytes: 32 * 1024,
  messageCharacters: 12_000,
  assistantDeltaCharacters: 4_000,
  assistantOutputCharacters: 32_000,
  publicErrorCharacters: 500,
  maxToolRounds: 8,
  maxRepairAttempts: 2,
  requestTimeoutMs: 120_000,
});
