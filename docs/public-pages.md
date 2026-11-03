# Public support and policy drafts

THE-44 owns `/support`, `/privacy` and `/terms`, with shared public navigation and
links from sign-in. They require no login or database access. The pages are original
plain-language drafts for owner review, not a claim of legal compliance or acceptance
by a plugin directory. Privacy/terms dates identify the drafting date, not an effective
publication date. The public-information layout sets noindex/nofollow while in draft.

## Owner-confirmed decisions

- Operator: Lukas Sorensen personally, Minnesota, United States.
- Contact for support and privacy: `lukas@theoryfoundry.com`.
- Adults aged 18 and over; free beta, without payments. The age requirement appears
  only in Terms, not Support or Privacy.
- TheoryFoundry does not sell personal information or train AI models on user content.
  This is TheoryFoundry's own policy, not a claim about external AI providers.
- Write against the intended account/project deletion behavior; the owner will
  implement deletion separately before public release.

Support is contact-only. Privacy uses broad data categories, purposes, sharing,
functional cookies/storage, retention, user requests and policy updates. It deliberately
avoids feature inventories, named clients and product-specific instructions. Changes to
actual data practices still require checking the policy for accuracy.

## Review and release

The deletion wording describes intended release behavior, not verified implementation.
THE-45 blocks the public plugin release until account/project deletion, owned-data
cleanup, artifact invalidation and session/grant revocation work and are verified.
Do not publish these drafts as current policies before that work is complete.

Before promoting these pages to production:

1. Review the exact wording with the owner, including project-use permission, beta
   disclaimers, Minnesota governing law, privacy purposes and retention exceptions.
2. Complete THE-45 and align the wording with the actual controls. Verify residual
   security/support data and backup retention, including restored-backup handling.
   No specific retention periods or support response times have been promised here.
3. Confirm the described infrastructure/email recipients and operational data against
   the live deployment. Repository configuration alone is not a live infrastructure
   audit; no exact hosting location or exhaustive vendor list is asserted.
4. Confirm the age restriction is communicated during account provisioning and any
   eventual public signup. Links on sign-in are disclosure, not a new recorded terms
   acceptance or age-verification mechanism. Assess that flow before public launch.
5. Replace the draft date labels with the actual effective date; remove draft-only
   robots metadata when approved for indexing. Deploy and verify all three routes
   while signed out, including contact links and navigation at mobile widths.
6. Only then fill the three production URLs in plugin publication metadata. The review
   recording, directory approval and real-client acceptance remain separate gates.

The site and root versions are 0.3.0 for the new public-page feature. Plugin metadata
also advances to 0.3.0 to satisfy its existing application-release alignment rule.
Runtime and the optional npm installer remain 0.2.0; their exact command pins are intact.

## Drafting references

The copy is based on the owner's decisions and inspected authentication/project
storage and MCP authorization behavior. General drafting references:

- [FTC: Protecting personal information](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business)
  for the data inventory, purpose, access and retention review.
- [TermsFeed privacy template](https://www.termsfeed.com/blog/sample-privacy-policy-template/)
  and [terms template](https://www.termsfeed.com/blog/sample-terms-and-conditions-template/)
  as structural references; no generator service or paid plan is required by this change.
