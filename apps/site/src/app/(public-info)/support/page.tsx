import Link from "next/link";
import type { Metadata } from "next";
import type { JSX } from "react";

export const metadata: Metadata = {
  title: "Support | TheoryFoundry",
  description:
    "Get help with TheoryFoundry, connected clients, and CAD rendering.",
};

export default function SupportPage(): JSX.Element {
  return (
    <article>
      <h1>TheoryFoundry support</h1>
      <p>
        TheoryFoundry is a free beta for adults aged 18 and over, operated by
        Lukas Sorensen in Minnesota, United States.
      </p>
      <section aria-labelledby="contact-heading">
        <h2 id="contact-heading">Contact</h2>
        <p>
          For help, bug reports, privacy questions, or questions about your
          account, email{" "}
          <a href="mailto:lukas@theoryfoundry.com">lukas@theoryfoundry.com</a>.
          Support is provided on a best-effort basis during the beta.
        </p>
        <p>
          Include the client you use, what you tried, what happened, and any
          error message. Remove passwords, access tokens, and confidential model
          content from screenshots or logs before sending them.
        </p>
      </section>
      <section aria-labelledby="connection-heading">
        <h2 id="connection-heading">Connection trouble</h2>
        <p>
          Check that the TheoryFoundry plugin or MCP connection is enabled in
          Codex or Claude Code and that account authorization has finished.
          Start a fresh client session after connecting.
        </p>
        <p>
          If authorization reports a rejected callback URL, include the exact
          callback URL and error in your support request. Never send an
          authorization code or token.
        </p>
      </section>
      <section aria-labelledby="rendering-heading">
        <h2 id="rendering-heading">Hosted rendering</h2>
        <p>
          Keep the matching TheoryFoundry project tab open, signed in, and
          visible while rendering. If a tool reports that a browser is required,
          return to that tab and retry the operation.
        </p>
      </section>
      <section aria-labelledby="data-heading">
        <h2 id="data-heading">Your account and data</h2>
        <p>
          You can delete projects or your account using the deletion controls in
          TheoryFoundry. For help with deletion or another privacy request,
          email the address above. See our{" "}
          <Link href="/privacy">privacy policy</Link> for how information is
          handled.
        </p>
        <p>
          To disconnect an AI client, revoke its access in{" "}
          <Link href="/settings/connected-apps">Connected apps</Link>.
          Disconnecting a client does not delete your projects or copies already
          received by that client.
        </p>
      </section>
    </article>
  );
}
