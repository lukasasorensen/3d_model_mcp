# Authentication browser journeys

Desktop (1440px) and narrow-phone (320px) integration tests cover the actual
sign-in client and authorization-navigation service with intercepted HTTP.

Sign-in coverage includes native required fields, rejected credentials, keyboard
retry, pending feedback and navigation only after a successful client response.
Authorization coverage exercises both Allow and Deny, failed requests, retry,
disabled choices, progress feedback and the resulting browser navigation.
The original signed-query string is forwarded unchanged; navigation follows the
provider response rather than an untrusted redirect parameter in that query.

The consent screen previously retained its failure alert while submitting a retry.
It now clears the old error and announces submission progress. The actions use
consistent spacing and the approved primary control styling. Permission copy,
redirect validation and authorization semantics are unchanged.

Run `pnpm test:browser 'signInForm|oauthConsent'` for the six new checks.
Both sign-in tests passed before changes; all four consent retry tests reproduced
the stale alert before the fix.

These tests use only synthetic credentials and signatures. HTTP and Next routing
are fixtures; real sessions, signature verification, provider grants, installed
client callbacks, screen-reader output and native devices are not verified here.
Existing server/provider tests and live acceptance remain separate.
