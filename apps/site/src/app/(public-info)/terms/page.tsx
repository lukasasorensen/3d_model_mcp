import Link from "next/link";
import type { Metadata } from "next";
import type { JSX } from "react";

export const metadata: Metadata = {
  title: "Terms of service | TheoryFoundry",
  description: "Terms for using the free TheoryFoundry CAD beta.",
};

export default function TermsPage(): JSX.Element {
  return (
    <article>
      <h1>Terms of service</h1>
      <p className="public-info-date">
        Draft for public release · November 3, 2026
      </p>
      <p>
        These terms govern your use of TheoryFoundry, operated by Lukas Sorensen
        in Minnesota, United States. By using the service, you agree to these
        terms. Contact{" "}
        <a href="mailto:lukas@theoryfoundry.com">lukas@theoryfoundry.com</a>{" "}
        with questions.
      </p>
      <section aria-labelledby="beta-heading">
        <h2 id="beta-heading">Eligibility and the free beta</h2>
        <p>
          You must be at least 18 years old to use TheoryFoundry. The current
          beta is free and does not collect payments. Any future paid offer will
          require a separate choice to purchase; using this beta does not
          authorize future charges.
        </p>
        <p>
          Features may change or be discontinued. Availability, support response
          times, and preservation of project data are not guaranteed. Keep
          independent copies of work you need.
        </p>
      </section>
      <section aria-labelledby="account-heading">
        <h2 id="account-heading">Your account and connected clients</h2>
        <p>
          Provide accurate account information, protect your credentials, and
          authorize only clients you trust. You are responsible for the
          instructions you give connected clients and for reviewing their
          actions. Notify us if you suspect unauthorized access.
        </p>
        <p>
          Third-party clients and AI providers have their own terms and
          policies. Their services, fees, and handling of information are
          separate from TheoryFoundry.
        </p>
      </section>
      <section aria-labelledby="ownership-heading">
        <h2 id="ownership-heading">Your projects and our service</h2>
        <p>
          You retain whatever rights you have in the content you submit and the
          resulting projects. You give TheoryFoundry permission to store, copy,
          process, modify as you instruct, render, and export that content to
          provide the service, including responding to clients you authorize.
          This permission does not transfer ownership of your projects to
          TheoryFoundry.
        </p>
        <p>
          Submit only content you have permission to use. Generated content may
          resemble other content, and we do not guarantee its originality or
          that it is free of third-party rights. TheoryFoundry’s software,
          branding, and other service materials remain the property of their
          respective owners.
        </p>
      </section>
      <section aria-labelledby="safety-heading">
        <h2 id="safety-heading">Validate designs before use</h2>
        <p>
          CAD and AI output can contain errors. A successful render, validation
          result, or export does not establish mechanical strength, fit,
          manufacturability, or safety. You are responsible for reviewing and
          testing designs before printing, manufacturing, distributing, or using
          them, and for obtaining professional review where appropriate.
        </p>
      </section>
      <section aria-labelledby="conduct-heading">
        <h2 id="conduct-heading">Acceptable use</h2>
        <p>
          Do not use the service unlawfully, infringe others’ rights, access
          another person’s account or projects without permission, bypass access
          controls, or interfere with the service. We may restrict or suspend
          access to address violations, security risks, or abuse.
        </p>
      </section>
      <section aria-labelledby="ending-heading">
        <h2 id="ending-heading">Ending use and deleting data</h2>
        <p>
          You can stop using the service, disconnect clients, and delete
          projects or your account using TheoryFoundry’s controls. Our{" "}
          <Link href="/privacy">privacy policy</Link> explains retention, backup
          copies, and information already received by external clients. Contact{" "}
          <Link href="/support">support</Link> if you need help.
        </p>
      </section>
      <section aria-labelledby="warranty-heading">
        <h2 id="warranty-heading">Disclaimers and liability</h2>
        <p>
          To the extent permitted by applicable law, the beta is provided “as
          is” and “as available,” without warranties of merchantability, fitness
          for a particular purpose, or non-infringement. We do not guarantee
          uninterrupted operation or error-free output.
        </p>
        <p>
          To the extent permitted by applicable law, Lukas Sorensen is not
          liable for indirect, incidental, special, or consequential losses
          arising from use of the service, including lost profits or lost data.
          Nothing in these terms excludes liability or consumer rights that
          cannot lawfully be excluded.
        </p>
      </section>
      <section aria-labelledby="law-heading">
        <h2 id="law-heading">Governing law and changes</h2>
        <p>
          Minnesota law governs these terms, except where mandatory laws
          applicable to you provide otherwise. We may revise these terms as the
          service changes, update this page, and provide additional notice where
          required. Contact us with questions before continuing to use the
          service under revised terms.
        </p>
      </section>
    </article>
  );
}
