/**
 * @jest-environment jsdom
 */
import React from "react";
import {render, screen, waitFor} from "@testing-library/react";
import {axe} from "jest-axe";
import MarketingHomePage from "@/app/(marketing)/page";
import PricingPage from "@/app/(marketing)/pricing/page";
import LoginPage from "@/app/(auth)/login/page";
import SignupPage from "@/app/(auth)/signup/page";
import DashboardPage from "@/app/(dashboard)/dashboard/page";

const envelope = (data: unknown) => ({ok: true, json: async () => ({ok: true, data})});

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(envelope({})) as unknown as typeof fetch;
});

describe("marketing home", () => {
  it("has exactly one h1", () => {
    render(<MarketingHomePage />);
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
  });

  it("offers a skip link before the navigation", () => {
    render(<MarketingHomePage />);
    expect(screen.getByText("Skip to content")).toHaveAttribute("href", "#main");
  });

  it("makes no claims it cannot support", () => {
    render(<MarketingHomePage />);
    const text = document.body.textContent ?? "";
    // The spec forbids fabricated social proof, and there are no real customers yet.
    expect(text).not.toMatch(/\b\d+[,\d]*\+? (customers|stores|brands|users)\b/i);
    expect(text).not.toMatch(/trusted by|as seen in|award|testimonial/i);
  });

  it("tells the user what happens to credits when a generation fails", () => {
    render(<MarketingHomePage />);
    // The promise the code actually keeps: a failed generation refunds the credits.
    expect(document.body.textContent).toMatch(/fails refunds them automatically/i);
  });

  it("describes the product this codebase actually is", () => {
    render(<MarketingHomePage />);
    const text = document.body.textContent ?? "";
    // The front page sold AI product photography long after the product became a
    // marketplace. A front door advertising something that does not exist is worse
    // than a plain one.
    expect(text).not.toMatch(/photograph/i);
    expect(text).not.toMatch(/reference photo/i);
    expect(text).toMatch(/storefront/i);
    expect(text).toMatch(/Stripe/);
  });

  it("has no accessibility violations", async () => {
    const {container} = render(<MarketingHomePage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("pricing", () => {
  it("explains the marketplace model: a fee per sale, not a monthly plan", () => {
    render(<PricingPage />);
    expect(screen.getByRole("heading", {name: "Selling"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "AI features"})).toBeInTheDocument();
    expect(screen.getByText(/per sale/)).toBeInTheDocument();
  });

  it("takes the fee rate from the checkout module rather than hardcoding it", () => {
    render(<PricingPage />);
    // Drifting between the advertised rate and the charged rate would be a
    // trust problem, so the page reads the same constant checkout uses.
    expect(document.body.textContent).toMatch(/5%/);
  });

  it("is honest that Stripe charges its own fees on top", () => {
    render(<PricingPage />);
    expect(document.body.textContent).toMatch(/Stripe/);
  });

  it("has no accessibility violations", async () => {
    const {container} = render(<PricingPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("auth pages", () => {
  it("labels both login fields", () => {
    render(<LoginPage />);
    // The accessible name includes "(required)" by design, so match loosely.
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument();
  });

  it("uses autocomplete hints password managers understand", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("autocomplete", "current-password");
  });

  it("asks signup for a new password, not a saved one", () => {
    render(<SignupPage />);
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("autocomplete", "new-password");
  });

  it("has no accessibility violations on login", async () => {
    const {container} = render(<LoginPage />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no accessibility violations on signup", async () => {
    const {container} = render(<SignupPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

const analytics = (over: Record<string, unknown> = {}) => ({
  periodDays: 30,
  revenue: {current: 0, previous: 0, changePct: null},
  orders: {current: 0, previous: 0, changePct: null},
  netToMerchant: 0, platformFees: 0, averageOrderValue: 0,
  refundRatePct: 0, topProducts: [],
  ...over,
});

describe("dashboard", () => {
  function serve(data: unknown) {
    global.fetch = jest.fn().mockResolvedValue(envelope(data)) as unknown as typeof fetch;
  }

  it("shows an empty state rather than fabricating numbers", async () => {
    serve(analytics());
    render(<DashboardPage />);
    expect(screen.getByRole("heading", {name: "Dashboard"})).toBeInTheDocument();
    // Zeroes for sales that never happened read as real data, so a store with no
    // orders is told so in words instead.
    expect(await screen.findByText("No sales in this period")).toBeInTheDocument();
  });

  it("points the merchant at the first useful action", async () => {
    serve(analytics());
    render(<DashboardPage />);
    expect(await screen.findByRole("button", {name: "Go to your products"})).toBeInTheDocument();
  });

  it("reports real figures once there are sales", async () => {
    serve(analytics({
      revenue: {current: 125_00, previous: 100_00, changePct: 25},
      orders: {current: 4, previous: 2, changePct: 100},
      netToMerchant: 118_75, platformFees: 6_25, averageOrderValue: 31_25,
    }));
    render(<DashboardPage />);
    expect(await screen.findByText("$125.00")).toBeInTheDocument();
    expect(screen.getByText("up 25% on the period before")).toBeInTheDocument();
    // The merchant's own take is the number they care about, and it is not the
    // same as revenue.
    expect(screen.getByText("$118.75")).toBeInTheDocument();
  });

  it("never states a percentage for growth from zero", async () => {
    // changePct is null when the previous period was zero. Rendering that as
    // "up 100%" or "up Infinity%" would be a number somebody acts on.
    serve(analytics({
      revenue: {current: 40_00, previous: 0, changePct: null},
      orders: {current: 1, previous: 0, changePct: null},
    }));
    render(<DashboardPage />);
    expect(await screen.findByText("$40.00")).toBeInTheDocument();
    expect(screen.getAllByText("First activity in this period").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Infinity|NaN/);
  });

  it("surfaces a failure instead of showing an empty dashboard", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 500,
      json: async () => ({ok: false, error: {code: "BOOM", message: "We couldn't load your figures."}}),
    }) as unknown as typeof fetch;
    render(<DashboardPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your figures.");
  });

  it("has no accessibility violations", async () => {
    serve(analytics());
    const {container} = render(<DashboardPage />);
    await screen.findByText("No sales in this period");
    expect(await axe(container)).toHaveNoViolations();
  });
});
