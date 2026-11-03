import Link from "next/link";
import type { Metadata } from "next";
import type { JSX } from "react";

export const metadata: Metadata = {
  title: "Privacy policy | TheoryFoundry",
  description:
    "How TheoryFoundry handles account information and CAD project data.",
};

export default function PrivacyPage(): JSX.Element {
  return (
    <article>
      <h1>Privacy policy</h1>
      <p className="public-info-date">
        Draft for public release · November 3, 2026
      </p>
      <p>
        TheoryFoundry is operated by Lukas Sorensen in Minnesota, United States.
        This policy explains how TheoryFoundry handles information when you use
        its website and CAD tools. For privacy questions, contact{" "}
        <a href="mailto:lukas@theoryfoundry.com">lukas@theoryfoundry.com</a>.
      </p>
      <section aria-labelledby="collection-heading">
        <h2 id="collection-heading">Information we handle</h2>
        <ul>
          <li>
            <strong>Account information:</strong> your name, email address,
            password hash, and account and sign-in records.
          </li>
          <li>
            <strong>Project information:</strong> project names and
            descriptions, model source, revisions, proposed changes, validation
            results, previews, and exported files.
          </li>
          <li>
            <strong>Connection and technical information:</strong> client
            authorizations, session and request identifiers, timestamps, browser
            information, IP addresses where recorded, and error details needed
            to operate and protect the service.
          </li>
          <li>
            <strong>Support information:</strong> messages and attachments you
            choose to send us.
          </li>
        </ul>
      </section>
      <section aria-labelledby="use-heading">
        <h2 id="use-heading">How we use information</h2>
        <p>
          We use information to manage accounts, authorize access, store and
          revise CAD projects, render models, produce exports, answer support
          requests, investigate failures, and protect against abuse. Access to
          user information is limited to these purposes and applicable legal
          obligations.
        </p>
        <p>
          TheoryFoundry does not sell personal information. We do not use users’
          CAD projects to train AI models.
        </p>
      </section>
      <section aria-labelledby="sharing-heading">
        <h2 id="sharing-heading">Connected clients and service providers</h2>
        <p>
          When you authorize an AI client such as Codex or Claude Code, that
          client can request CAD information and operations through your
          connection. Responses may include project details, model source,
          previews, validation results, and exports. Authorizing a client gives
          it access to the CAD projects available to your account; installing
          its configuration in one repository does not restrict that
          authorization to a single CAD project.
        </p>
        <p>
          Your chosen client and its AI provider handle the information they
          receive under their own terms, privacy policies, and account settings.
          TheoryFoundry’s no-training policy does not change those providers’
          practices.
        </p>
        <p>
          Providers used for infrastructure, network delivery, security, and
          email may process information as needed to provide those services. We
          may also disclose information when required by law or necessary to
          protect users, investigate abuse, or defend legal rights.
        </p>
      </section>
      <section aria-labelledby="storage-heading">
        <h2 id="storage-heading">Cookies and browser storage</h2>
        <p>
          TheoryFoundry uses authentication cookies and browser session storage
          to keep you signed in and coordinate the project workspace and
          rendering. Blocking them may prevent these features from working.
          Connected clients manage their own local credentials and storage.
        </p>
      </section>
      <section aria-labelledby="retention-heading">
        <h2 id="retention-heading">Retention and deletion</h2>
        <p>
          We retain account and project information to provide the service until
          you delete it or it is no longer needed. You can delete individual
          projects or your account using TheoryFoundry’s deletion controls.
          Account deletion removes associated project data and revokes account
          access.
        </p>
        <p>
          Limited records may be retained where necessary for security, legal
          obligations, or resolving disputes. Backup copies may remain until
          replaced through the backup retention process; they are not used for
          ordinary product access. Deletion from TheoryFoundry does not delete
          exports you downloaded or information already received by an external
          client or provider.
        </p>
      </section>
      <section aria-labelledby="choices-heading">
        <h2 id="choices-heading">Your choices and requests</h2>
        <p>
          Revoke an AI client’s authorization in{" "}
          <Link href="/settings/connected-apps">Connected apps</Link>. For help
          accessing, correcting, exporting, or deleting personal information,
          email{" "}
          <a href="mailto:lukas@theoryfoundry.com">lukas@theoryfoundry.com</a>.
          We may need to verify that a request concerns your account before
          acting on it. Applicable privacy rights depend on your location.
        </p>
      </section>
      <section aria-labelledby="age-heading">
        <h2 id="age-heading">Adults only</h2>
        <p>
          TheoryFoundry is intended for people aged 18 and over. If you believe
          someone under 18 has provided information, contact us so we can
          investigate and remove it as appropriate.
        </p>
      </section>
      <section aria-labelledby="changes-heading">
        <h2 id="changes-heading">Changes and contact</h2>
        <p>
          We will update this page when our practices change and provide
          additional notice where required. Questions can be sent to{" "}
          <a href="mailto:lukas@theoryfoundry.com">lukas@theoryfoundry.com</a>.
          You can also visit <Link href="/support">support</Link> or read our{" "}
          <Link href="/terms">terms of service</Link>.
        </p>
      </section>
    </article>
  );
}
