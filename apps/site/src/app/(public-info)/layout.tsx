import Link from "next/link";
import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PublicInfoLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="public-info">
      <a className="skip-link" href="#public-content">
        Skip to content
      </a>
      <header className="public-info-header">
        <Link href="/sign-in">TheoryFoundry</Link>
        <nav aria-label="Information pages">
          <Link href="/support">Support</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </header>
      <main id="public-content" tabIndex={-1}>
        {children}
      </main>
      <footer>
        <p>TheoryFoundry · Lukas Sorensen · Minnesota, United States</p>
        <a href="mailto:lukas@theoryfoundry.com">lukas@theoryfoundry.com</a>
      </footer>
    </div>
  );
}
