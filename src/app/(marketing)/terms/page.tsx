import React from "react";
import type {Metadata} from "next";
import {LegalPage} from "@/components/marketing/LegalPage";
import {DEFAULT_FEE_BASIS_POINTS} from "@/core/commerce/checkoutService";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply to selling and buying on Storovex.",
};

export default function TermsPage() {
  const feePercent = (DEFAULT_FEE_BASIS_POINTS / 100).toFixed(1).replace(/\.0$/, "");

  return (
    <LegalPage
      title="Terms of Service"
      updated="2026-09-04"
      intro="These terms cover using Storovex, whether you are running a store or buying from one."
    >
      <section>
        <h2>Who this is between</h2>
        <p>
          Storovex is a platform that lets sellers run their own storefronts. When you buy
          something, your contract for those goods is with the seller, not with Storovex.
          We handle the storefront, the checkout and the payment routing.
        </p>
      </section>

      <section>
        <h2>Running a store</h2>
        <p>To sell on Storovex you agree that:</p>
        <ul>
          <li>You have the right to sell what you list, and your listings describe it accurately.</li>
          <li>You will fulfil orders you accept, or cancel and refund them promptly.</li>
          <li>You will not list anything illegal, counterfeit, or that you are not permitted to sell.</li>
          <li>You are responsible for your own tax obligations on your sales.</li>
        </ul>
        <p>
          We may suspend a store that breaks these terms. Where we do, we will tell you why.
        </p>
      </section>

      <section>
        <h2>Fees and payouts</h2>
        <p>
          There is no charge to open a store or list products. Storovex takes {feePercent}% of
          each sale as a platform fee, deducted as the payment is routed to you. The remainder
          goes to your connected Stripe account on Stripe&apos;s normal payout schedule.
        </p>
        <p>
          If you refund an order, the platform fee on that order is returned to you as well.
          We do not keep a fee on a sale that did not happen.
        </p>
      </section>

      <section>
        <h2>Buying</h2>
        <p>
          Prices are set by the seller and shown before you pay. Your items are reserved for
          twenty minutes while you complete payment; if payment is not completed in that time
          the reservation is released and the items return to sale.
        </p>
        <p>
          Refunds and returns are handled by the seller under their own policy and your local
          consumer rights. Contact the seller first. If you cannot reach them, contact us.
        </p>
      </section>

      <section>
        <h2>AI features</h2>
        <p>
          Some features generate content — product video ads, and an assistant that answers
          questions about your own catalogue. Generated content is a starting point, not a
          guarantee: you are responsible for checking anything you publish. Credits spent on
          a generation that fails are returned automatically.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          We work to keep Storovex running, but we do not promise uninterrupted service. We
          are not liable for indirect or consequential loss. Nothing here limits liability
          that cannot be limited by law.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We may update these terms. If a change materially affects sellers, we will give
          notice before it takes effect. Continuing to use Storovex after that means you
          accept the updated terms.
        </p>
      </section>
    </LegalPage>
  );
}
