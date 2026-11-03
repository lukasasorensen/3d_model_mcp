import { schema, type ProjectDatabase } from "@theoryfoundry/model-project";
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { isSystemAdmin } from "../../shared/utils/systemAdmin.util.js";

const { platformInvitation: invites, user, account } = schema;
const now = sql`clock_timestamp()`;
const open = and(isNull(invites.revokedAt), isNull(invites.acceptedAt));
const active = and(open, gt(invites.expiresAt, now));
const digest = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export class InvitationError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function requireAdmin(actorId: string): void {
  if (!isSystemAdmin(actorId))
    throw new InvitationError(403, "Administrator access is required.");
}
function unavailable(): InvitationError {
  return new InvitationError(
    410,
    "This invitation is no longer available. Ask an administrator for a new link.",
  );
}
interface PasswordPolicy {
  config: { minPasswordLength: number; maxPasswordLength: number };
  hash(password: string): Promise<string>;
}

interface InvitationSummary {
  id: string;
  email: string;
  creator: string;
  expiresAt: Date;
  status: "pending" | "expired" | "revoked" | "accepted";
}

export class PlatformInvitations {
  constructor(private readonly db: ProjectDatabase["db"]) {}

  async list(actorId: string): Promise<InvitationSummary[]> {
    requireAdmin(actorId);
    return this.db
      .select({
        id: invites.id,
        email: invites.email,
        creator: user.email,
        expiresAt: invites.expiresAt,
        status: sql<
          InvitationSummary["status"]
        >`case when ${invites.acceptedAt} is not null then 'accepted'
        when ${invites.revokedAt} < ${invites.expiresAt} then 'revoked'
        when ${invites.expiresAt} <= clock_timestamp() then 'expired' else 'pending' end`,
      })
      .from(invites)
      .innerJoin(user, eq(user.id, invites.createdBy))
      .orderBy(desc(invites.createdAt));
  }

  async issue(
    actorId: string,
    address: string,
    replaceId?: string,
  ): Promise<{ id: string; email: string; token: string }> {
    requireAdmin(actorId);
    const email = address.trim().toLowerCase();
    if (email.length > 254 || !z.email().safeParse(email).success)
      throw new InvitationError(400, "Enter a valid email address.");
    const token = randomBytes(32).toString("base64url");
    const id = await this.db.transaction(async (tx) => {
      if (replaceId) {
        const replaced = await tx
          .update(invites)
          .set({ revokedAt: now })
          .where(
            and(eq(invites.id, replaceId), eq(invites.email, email), active),
          )
          .returning({ id: invites.id });
        if (!replaced.length)
          throw new InvitationError(
            409,
            "The selected invitation is no longer pending.",
          );
      }
      await tx
        .update(invites)
        .set({ revokedAt: now })
        .where(
          and(eq(invites.email, email), open, lte(invites.expiresAt, now)),
        );
      const inserted = await tx
        .insert(invites)
        .values({
          id: randomUUID(),
          email,
          createdBy: actorId,
          tokenDigest: digest(token),
          expiresAt: sql`clock_timestamp() + interval '7 days'`,
        })
        .onConflictDoNothing()
        .returning({ id: invites.id });
      const [existing] = await tx
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.email}) = ${email}`)
        .limit(1);
      if (existing)
        throw new InvitationError(
          409,
          "An account already exists for this email.",
        );
      const invitation = inserted[0];
      if (!invitation)
        throw new InvitationError(
          409,
          "An invitation is pending. Use Replace to issue a new link.",
        );
      return invitation.id;
    });
    return { id, email, token };
  }

  async revoke(actorId: string, id: string): Promise<void> {
    requireAdmin(actorId);
    const revoked = await this.db
      .update(invites)
      .set({ revokedAt: now })
      .where(and(eq(invites.id, id), active))
      .returning({ id: invites.id });
    if (!revoked.length)
      throw new InvitationError(
        409,
        "The selected invitation is no longer pending.",
      );
  }

  async accept(
    token: string,
    name: string,
    password: string,
    policy: PasswordPolicy,
  ): Promise<string> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) throw unavailable();
    const displayName = name.trim();
    if (!displayName || displayName.length > 200)
      throw new InvitationError(400, "Enter a name of up to 200 characters.");
    const { minPasswordLength: min, maxPasswordLength: max } = policy.config;
    if (password.length < min || password.length > max)
      throw new InvitationError(
        400,
        `Choose a password between ${min} and ${max} characters.`,
      );
    return this.db.transaction(async (tx) => {
      const [invite] = await tx
        .update(invites)
        .set({ acceptedAt: now })
        .where(and(eq(invites.tokenDigest, digest(token)), active))
        .returning({ email: invites.email });
      if (!invite) throw unavailable();
      const id = randomUUID();
      const inserted = await tx
        .insert(user)
        .values({
          id,
          email: invite.email,
          name: displayName,
          emailVerified: false,
        })
        .onConflictDoNothing()
        .returning({ id: user.id });
      const invitation = inserted[0];
      if (!invitation) throw unavailable();
      await tx.insert(account).values({
        id: randomUUID(),
        userId: id,
        accountId: id,
        providerId: "credential",
        issuer: "local:credential",
        password: await policy.hash(password),
      });
      return invite.email;
    });
  }
}
