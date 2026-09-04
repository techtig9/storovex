import React from "react";
import type {Metadata} from "next";
import {LegalPage} from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Storovex collects, why, and what you can ask us to do with it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="2026-09-04"
      intro="What we collect, why we collect it, and what you can ask us to do with it."
    >
      <section>
        <h2>What we collect</h2>
        <p>If you run a store:</p>
        <ul>
          <li>Your email address and name, so you can sign in and we can contact you.</li>
          <li>Your store details and catalogue.</li>
          <li>A record of what your store sells, so we can show you your own figures.</li>
        </ul>
        <p>If you buy something:</p>
        <ul>
          <li>Your email address, so the seller can send a receipt and updates.</li>
          <li>Your delivery address, shared with the seller so they can send your order.</li>
          <li>What you bought and what it cost.</li>
        </ul>
        <p>
          Your basket before you check out is held against a random identifier stored in
          your browser. It is not linked to you until you enter your email.
        </p>
      </section>

      <section>
        <h2>Card details</h2>
        <p>
          Card details are entered directly into Stripe&apos;s payment form and go to Stripe,
          not to us. Storovex never sees or stores a card number.
        </p>
      </section>

      <section>
        <h2>Who else sees it</h2>
        <p>
          Sellers see the information needed to fulfil their own orders — the email and
          delivery address on that order, and what was bought. A seller cannot see orders
          you placed with any other seller, even in the same basket.
        </p>
        <p>We use these services to run Storovex:</p>
        <ul>
          <li><strong>Supabase</strong> — database, authentication and file storage.</li>
          <li><strong>Stripe</strong> — payments and payouts.</li>
          <li><strong>AI providers</strong> — only for the text and video a store explicitly asks to generate.</li>
        </ul>
        <p>We do not sell your information, and we do not share it for advertising.</p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>
          Order records are kept for as long as tax and accounting rules require, because
          both you and the seller may need them. Abandoned baskets are cleared automatically.
          If you close a store, we remove its catalogue but keep the order history that
          belongs to it.
        </p>
      </section>

      <section>
        <h2>What you can ask for</h2>
        <p>You can ask us to:</p>
        <ul>
          <li>Send you a copy of what we hold about you.</li>
          <li>Correct anything that is wrong.</li>
          <li>Delete your account and the data that is not required for order records.</li>
        </ul>
        <p>
          Email us and we will respond within thirty days. Depending on where you live you may
          also have the right to complain to a data protection regulator.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Access to store data is enforced in the database itself, not only in the
          application, so one seller cannot read another&apos;s orders even if a bug in our
          code tried to let them. Payment and financial tables are not reachable from a
          browser at all.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If we change what we collect or why, we will update this page and change the date
          at the top.
        </p>
      </section>
    </LegalPage>
  );
}
