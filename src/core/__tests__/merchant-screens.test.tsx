/**
 * @jest-environment jsdom
 */
import React from "react";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {axe} from "jest-axe";
import ProductsPage from "@/app/(dashboard)/products/page";
import OrdersPage from "@/app/(dashboard)/orders/page";
import SettingsPage from "@/app/(dashboard)/settings/page";

const ok = (data: unknown) => ({ok: true, status: 200, json: async () => ({ok: true, data})});
const fail = (status: number, code: string, message: string) =>
  ({ok: false, status, json: async () => ({ok: false, error: {code, message}})});

beforeEach(() => jest.restoreAllMocks());

describe("products screen", () => {
  it("invites a first product rather than showing an empty table", async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({products: [], total: 0})) as unknown as typeof fetch;
    render(<ProductsPage />);
    expect(await screen.findByText("No products yet")).toBeInTheDocument();
  });

  it("distinguishes an empty catalogue from an empty search result", async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({products: [], total: 0})) as unknown as typeof fetch;
    render(<ProductsPage />);
    await screen.findByText("No products yet");

    await userEvent.type(screen.getByLabelText("Search"), "scarf");
    // "No products yet" would be wrong here — they have products, just none matching.
    expect(await screen.findByText("No products match those filters.")).toBeInTheDocument();
  });

  it("labels a live product as live, not by its stored status value", async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({
      products: [{id: "p1", title: "Merino Scarf", description: null,
                  status: "active", created_at: new Date().toISOString()}],
      total: 1,
    })) as unknown as typeof fetch;

    render(<ProductsPage />);
    // The column holds "active"; a merchant reads "Live".
    expect(await screen.findByText("Live")).toBeInTheDocument();
    expect(screen.queryByText("active")).not.toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({
      products: [{id: "p1", title: "Merino Scarf", description: "Soft.",
                  status: "draft", created_at: new Date().toISOString()}],
      total: 1,
    })) as unknown as typeof fetch;

    const {container} = render(<ProductsPage />);
    await screen.findByText("Merino Scarf");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("orders screen", () => {
  it("translates every stored status into words a person reads", async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({
      orders: [
        {id: "o1", orderNumber: 1, email: "a@example.com", status: "pending_payment",
         total: 1000, createdAt: new Date().toISOString()},
        {id: "o2", orderNumber: 2, email: "b@example.com", status: "fulfilled",
         total: 2000, createdAt: new Date().toISOString()},
      ],
      total: 2,
    })) as unknown as typeof fetch;

    render(<OrdersPage />);
    expect(await screen.findByText("Awaiting payment")).toBeInTheDocument();
    expect(screen.getByText("Fulfilled")).toBeInTheDocument();
    expect(screen.queryByText("pending_payment")).not.toBeInTheDocument();
  });

  it("surfaces a load failure rather than reporting zero orders", async () => {
    global.fetch = jest.fn()
      .mockResolvedValue(fail(500, "BOOM", "We couldn't load your orders.")) as unknown as typeof fetch;
    render(<OrdersPage />);
    // "No orders yet" on a server error tells a merchant their sales vanished.
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your orders.");
  });
});

describe("settings screen", () => {
  it("warns when payouts are not connected, because nothing can be sold without it", async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({
      id: "s1", name: "Probe Shop", slug: "probe-shop",
      stripeConnected: false, creditsRemaining: 40,
    })) as unknown as typeof fetch;

    render(<SettingsPage />);
    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    expect(screen.getByText(/shoppers can't pay you/i)).toBeInTheDocument();
  });

  it("never puts the Stripe account id in the page", async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({
      id: "s1", name: "Probe Shop", slug: "probe-shop",
      stripeConnected: true, creditsRemaining: 40,
    })) as unknown as typeof fetch;

    render(<SettingsPage />);
    await screen.findByText("Connected");
    // The API returns only whether onboarding finished. The id itself has no
    // business reaching a browser.
    expect(document.body.textContent).not.toMatch(/acct_/);
  });

  it("keeps a heading in every state, including while loading", async () => {
    // A page whose h1 only appears with its data has no h1 at all while loading,
    // which leaves a screen reader nothing to announce.
    let resolve: (v: unknown) => void = () => {};
    global.fetch = jest.fn().mockReturnValue(
      new Promise(r => { resolve = r; })) as unknown as typeof fetch;

    render(<SettingsPage />);
    expect(screen.getByRole("heading", {level: 1, name: "Settings"})).toBeInTheDocument();

    resolve(ok({id: "s1", name: "Probe Shop", slug: "probe-shop",
                stripeConnected: true, creditsRemaining: 0}));
    await waitFor(() =>
      expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1));
  });
});
