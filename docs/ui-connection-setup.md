# Connection setup

THE-39 uses one native dialog. Choose browser or Mac rendering, a supported
local client when applicable, and global or repository installation scope.
The matching command and authorization instructions update immediately below
the choices. The project starter prompt is always expanded as a simple section.

The heading receives focus when opening; Escape and Close retain native dialog
behavior. Choices persist when reopening, and changing a choice keeps focus on
that control. The header stays visible while choices and instructions scroll,
keeping Close available on phones.

Hosted setup now selects Codex or Claude Code and offers the published plugin for
that deployment. Advanced setup includes matching-origin native configuration and,
when the operator marks the npm release available, the optional Codex installer.
Missing listing URLs open the manual fallback; a development origin never inherits
a production plugin link. Local-worker choices retain their availability gate and
existing client/scope behavior. The UI does not treat copying or installation as
proof of authorization. See [plugin release](plugin-release.md).

## Verification

With the pinned Node version and Playwright Chromium installed, run:

```sh
pnpm test:browser connectToCodex.component
```

The check renders the actual dialog without executing commands. It checks all eight
supported client/mode/scope combinations against the existing command generators,
selection focus, preserved choices, clipboard success and unavailable-API fallback,
always-expanded project starter text, Escape focus restoration, reopening, and
horizontal overflow at 1440/390/320px. Browser-only tests verify that unavailable
local-worker choices stay absent. Real installer, authorization, and external-client
acceptance remain separate work.
