# Account and project erasure

From **Your projects**, an owner can confirm deletion of a project, or open **Account settings** and supply their password and the word DELETE to erase the entire account. Archiving remains reversible. A new invitation after erasure creates a new account with a different ID.

## Active storage

Deletion locks the owner and affected projects, then removes revision history, source, previews, candidates, jobs, leases, hosted exports and download tokens. Account erasure includes archived projects, invitations issued by or addressed to the owner, credentials, sessions, OAuth consents, tokens and pending authorization codes. Other accounts keep their projects and sessions. PostgreSQL foreign keys and the authorization-code owner trigger serialize late writes against deletion. Stored exports are removed by their validated storage IDs. Copies already downloaded or transferred to another service are outside hosted storage.

A separate journal retains the owner ID, optional project ID and affected export and invitation IDs. It contains no email addresses, credentials, source or model bytes. The application durably writes the authorized record before committing database deletion. Physical file removal follows commit. Retries, replay and the regular orphan-file sweep recover from interrupted cleanup. Replay also converts projects soft-deleted by older releases to physical deletion. The model-project SQL migration adds an owner check for in-flight OAuth authorization codes.

## Storage and retention

- Production operators must keep the latest erasure journal **outside the database and export backup restore set**, with a restricted, independently protected copy. Never roll the journal back with a database backup. Keep records until every backup or snapshot that could contain the corresponding data has expired or been destroyed. If that inventory is unknown, keep the records.
- Private database and export backups may contain deleted content until their scheduled expiry. Inventory all locations, expiry rules and recovery copies before enabling public deletion claims. Restorable copies stay access-restricted and offline except for controlled recovery. No verified production expiry period is asserted here.
- Support correspondence is managed separately. Retain only the minimum correspondence needed for an open request, then remove it when the request and any documented legal or security hold end. Limit security logs to the established operational retention schedule. Exclude passwords, bearer links, journal payloads and model source from logs.
- Development defaults to a journal adjacent to the temporary export store. For persistent developer instances, configure an absolute private THEORYFOUNDRY_ERASURE_DIRECTORY. Production deletion and the operator replay command always require an explicitly configured journal with a JOURNAL marker.

## Initial Coolify setup

Before the first deployment of this release, initialize the dedicated external Docker volume **once for this installation**. Use a separate volume per installation. The example assumes the default volume name and app UID/GID 1001. The data and export volumes keep their existing names.

```sh
docker volume create theoryfoundry-erasure-journal
docker run --rm -v theoryfoundry-erasure-journal:/journal postgres:18.6-bookworm sh -ec '
  test -z "$(ls -A /journal)"
  printf "%s\n" theoryfoundry-erasure-v1 > /journal/JOURNAL
  chown -R 1001:1001 /journal && chmod 700 /journal
'
```

This initialization is only for a new journal. On recovery attach the current existing journal; never initialize an empty replacement. Configure and verify an independent backup of the journal. The migrate service must finish migrations and erasure replay before Coolify starts the app. Failure to read a marker or record, write a receipt, or delete a recorded file fails the gate.

## Recovery from backup

1. Keep all HTTP, MCP, worker and operator writers disconnected. Restore the database and export files into an isolated deployment. Attach the latest independent journal. If its completeness cannot be established, keep the deployment offline.
2. Run the current migrations and the replay tool with the restored database, export directory and journal mounted. For a full restore use the offline sweep to remove orphan export files, including temporary files present only in the snapshot.

   ```sh
   pnpm db:migrate
   node packages/runtime/dist/replayErasures.composition.js --offline
   ```

3. Verify previous sessions, OAuth grants, download links, invitations and affected projects no longer work. Confirm an unrelated account retains access. Repeat replay and confirm the same result. Record checks and the backup generation before switching traffic.
4. Always use an erasure-aware build for recovery. An older application pointed at a restored database bypasses replay. Keep backups within the verified retention inventory and retire obsolete copies before pruning journal records.
