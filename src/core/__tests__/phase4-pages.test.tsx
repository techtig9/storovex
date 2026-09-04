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
    expect(document.body.textContent).toMatch(/refunded in full/i);
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

describe("dashboard", () => {
  it("shows an empty state rather than fabricating numbers", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", {name: "Dashboard"})).toBeInTheDocument();
    // Rendering zeroes for sales that have not happened would read as real data.
    expect(screen.getByText("Nothing to show yet")).toBeInTheDocument();
  });

  it("points the merchant at the first useful action", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("button", {name: "Add a product"})).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const {container} = render(<DashboardPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
