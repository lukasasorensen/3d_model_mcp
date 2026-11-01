# Guided connection setup

THE-39 continues with a two-step native dialog:

1. Choose browser or Mac rendering, a supported local client when applicable,
   and global or repository installation scope.
2. Review prerequisites and scope implications, copy the matching command, then
   follow authorization and restart guidance. A project starter prompt is
   available in a named disclosure.

The step heading receives focus on navigation; Escape and Close retain native
dialog behavior. Choices persist when returning to the first step. Reopening
starts at the choices step. The header stays visible while long instructions
scroll, keeping Close available on phones.

The hosted and local command generators, pinned worker version, configuration
scope, and authorization behavior are unchanged. Prerequisites, local release
availability, installer effects, backups/conflicts, repository trust, credential
storage, and browser-tab requirements remain visible in the instructions.
The UI does not claim that copying a command establishes a connection.

## Verification

With the pinned Node version and Playwright Chromium installed, run:

```sh
node tooling/ui-redesign/setupAcceptance.script.mjs
```

The check renders the actual dialog without executing commands. It checks all six
supported client/mode/scope combinations against the existing command generators,
step focus, preserved choices, clipboard success and unavailable-API fallback,
project starter text, Escape focus restoration, reopening, and horizontal overflow
at 1440/390/320px. Phone screenshots were visually inspected. Real installer,
authorization, and external-client acceptance remain separate work.
