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
  it("shows every plan with its real credit allowance", () => {
    render(<PricingPage />);
    for (const name of ["Starter", "Mid", "Pro"]) {
      expect(screen.getByRole("heading", {name})).toBeInTheDocument();
    }
    // Sourced from the plans module, not hardcoded in the page.
    expect(screen.getByText(/3,000/)).toBeInTheDocument();
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
  it("requests its own store rather than sending a placeholder id", async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const urls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
    // "current" was sent as a literal store id before, which can never match a UUID.
    expect(urls.some(u => u.includes("current"))).toBe(false);
    expect(urls).toEqual(expect.arrayContaining(["/api/dashboard/kpis", "/api/projects"]));
  });

  it("shows an empty state rather than a blank page when there are no projects", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(envelope({activationRatePct: 0, generationSuccessRatePct: 100, creditsRemainingPct: 100}))
      .mockResolvedValueOnce(envelope({projects: []}));
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText("No projects yet")).toBeInTheDocument());
  });

  it("surfaces a failure instead of showing zeroes as if they were real", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ok: false, status: 500, json: async () => ({})});
    render(<DashboardPage />);
    // Rendering 0% for a failed request would be fabricated data.
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
  });

  it("renders projects it receives", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(envelope({activationRatePct: 40, generationSuccessRatePct: 90, creditsRemainingPct: 60}))
      .mockResolvedValueOnce(envelope({projects: [{id: "p1", name: "Fall Drop", status: "active", updated_at: "2026-01-01"}]}));
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText("Fall Drop")).toBeInTheDocument());
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("has no accessibility violations once loaded", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(envelope({activationRatePct: 40, generationSuccessRatePct: 90, creditsRemainingPct: 60}))
      .mockResolvedValueOnce(envelope({projects: [{id: "p1", name: "Fall Drop", status: "active", updated_at: "2026-01-01"}]}));
    const {container} = render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText("Fall Drop")).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});
