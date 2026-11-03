import type { Metadata } from "next";
import type { JSX } from "react";

export const metadata: Metadata = {
  title: "Support | TheoryFoundry",
  description: "Contact TheoryFoundry support.",
};

export default function SupportPage(): JSX.Element {
  return (
    <article>
      <h1>Support</h1>
      <p>
        Contact{" "}
        <a href="mailto:lukas@theoryfoundry.com">lukas@theoryfoundry.com</a>.
      </p>
    </article>
  );
}
