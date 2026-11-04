import type { Metadata } from "next";
import type { JSX } from "react";

export const metadata: Metadata = {
  title: "Privacy policy | TheoryFoundry",
  description: "How TheoryFoundry handles your information.",
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
        For privacy questions, contact{" "}
        <a href="mailto:lukas@theoryfoundry.com">lukas@theoryfoundry.com</a>.
      </p>
      <section aria-labelledby="collection-heading">
        <h2 id="collection-heading">Information we collect and use</h2>
        <p>
          We collect account and contact information, content you provide, and
          technical information such as IP addresses, browser details, and usage
          records. We use this information to provide and improve the service,
          respond to requests, maintain security, and meet legal obligations.
        </p>
        <p>
          We use cookies and similar storage for sign-in and service
          functionality. TheoryFoundry does not sell personal information or use
          your content to train AI models.
        </p>
      </section>
      <section aria-labelledby="sharing-heading">
        <h2 id="sharing-heading">Sharing</h2>
        <p>
          We share information with service providers as needed to operate the
          service, with integrations you authorize, and when required by law or
          necessary to protect users and the service. External services handle
          information they receive under their own terms and privacy policies.
        </p>
      </section>
      <section aria-labelledby="retention-heading">
        <h2 id="retention-heading">Retention and your choices</h2>
        <p>
          We retain information as needed for the purposes above. You can delete
          your account from Account settings or delete individual projects from
          Your projects. You can also contact us to request access, correction,
          or deletion of personal information. We may verify your identity
          before acting. Deleted content is removed from active storage. Support
          correspondence and security records may remain while needed for those
          purposes. Deletion does not remove copies held by external services
          you used.
        </p>
      </section>
      <section aria-labelledby="changes-heading">
        <h2 id="changes-heading">Changes</h2>
        <p>
          We will update this page when this policy changes and provide
          additional notice where required.
        </p>
      </section>
    </article>
  );
}
