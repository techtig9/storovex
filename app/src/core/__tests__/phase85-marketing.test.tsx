/**
 * @jest-environment jsdom
 */
import React from "react";
import {render,screen,fireEvent} from "@testing-library/react";
import MarketingHomePage from "../../app/(marketing)/page";
import PricingPage from "../../app/(marketing)/pricing/page";

describe("MarketingHomePage",()=>{
 it("renders the hero, example frames, and how-it-works steps",()=>{
  render(<MarketingHomePage />);
  expect(screen.getByRole("heading",{level:1})).toHaveTextContent("Your product, shot a dozen ways");
  expect(screen.getByText("Start generating")).toBeInTheDocument();
  expect(screen.getByText("frame 01 · f/2.8 · hero")).toBeInTheDocument();
  expect(screen.getByText("Frame 01")).toBeInTheDocument();
  expect(screen.getByText("Upload")).toBeInTheDocument();
 });
 it("links to pricing, login and signup",()=>{
  render(<MarketingHomePage />);
  expect(screen.getByText("Pricing")).toHaveAttribute("href","/pricing");
  expect(screen.getByText("Log in")).toHaveAttribute("href","/login");
  expect(screen.getByText("Start free")).toHaveAttribute("href","/signup");
 });
});

describe("PricingPage",()=>{
 it("renders all three plans and toggles billing cycle",()=>{
  render(<PricingPage />);
  expect(screen.getByText("Starter")).toBeInTheDocument();
  expect(screen.getByText("Mid")).toBeInTheDocument();
  expect(screen.getByText("Pro")).toBeInTheDocument();
  expect(screen.getByText("$17").parentElement).toBeInTheDocument();

  fireEvent.click(screen.getByText("Annual (20% off)"));
  // annual price should now be shown for Starter and differ from the monthly figure
  expect(screen.queryByText(/\$17\/mo/)).not.toBeInTheDocument();
 });
});
