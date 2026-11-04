import Link from "next/link";
import type { Metadata } from "next";
import type { JSX } from "react";

export const metadata: Metadata = {
  title: "Terms of service | TheoryFoundry",
  description: "Terms for using the free TheoryFoundry beta.",
};

export default function TermsPage(): JSX.Element {
  return (
    <article>
      <h1>Terms of service</h1>
      <p className="public-info-date">
        Draft for public release · November 3, 2026
      </p>
      <p>
        By using TheoryFoundry, you agree to these terms. For questions, contact{" "}
        <a href="mailto:lukas@theoryfoundry.com">lukas@theoryfoundry.com</a>.
      </p>
      <section aria-labelledby="beta-heading">
        <h2 id="beta-heading">Eligibility and the free beta</h2>
        <p>
          You must be at least 18 years old. The beta is free and does not
          collect payments. Any future paid services require a separate
          purchase.
        </p>
      </section>
      <section aria-labelledby="use-heading">
        <h2 id="use-heading">Using the service</h2>
        <p>
          You are responsible for your account, credentials, and third-party
          services you connect. Those services have their own terms and
          policies. Do not use TheoryFoundry unlawfully, infringe others’
          rights, access information without permission, or interfere with the
          service. We may restrict or suspend access for violations, abuse, or
          security risks.
        </p>
      </section>
      <section aria-labelledby="content-heading">
        <h2 id="content-heading">Your content</h2>
        <p>
          You retain your rights to content you provide. You give TheoryFoundry
          permission to use and process it as needed to provide the service.
          Submit only content you have permission to use. Our software,
          branding, and service materials remain the property of their
          respective owners.
        </p>
      </section>
      <section aria-labelledby="warranty-heading">
        <h2 id="warranty-heading">Disclaimers and liability</h2>
        <p>
          To the extent permitted by law, the service is provided “as is” and
          “as available,” without warranties of merchantability, fitness for a
          particular purpose, or non-infringement. We do not guarantee
          availability, accuracy, or preservation of data. You are responsible
          for reviewing and validating output before use.
        </p>
        <p>
          To the extent permitted by law, TheoryFoundry is not liable for
          indirect, incidental, special, or consequential losses, including lost
          profits or data. These terms do not limit rights or liability that
          cannot lawfully be limited.
        </p>
      </section>
      <section aria-labelledby="ending-heading">
        <h2 id="ending-heading">Ending use</h2>
        <p>
          You can stop using the service at any time. See our{" "}
          <Link href="/privacy">privacy policy</Link> for information about data
          handling and deletion.
        </p>
      </section>
      <section aria-labelledby="changes-heading">
        <h2 id="changes-heading">Changes to these terms</h2>
        <p>We may revise these terms as the service changes.</p>
      </section>
    </article>
  );
}
