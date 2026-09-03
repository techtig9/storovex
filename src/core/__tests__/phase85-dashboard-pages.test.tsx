/**
 * @jest-environment jsdom
 */
import React from "react";
import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import DashboardPage from "../../app/(dashboard)/dashboard/page";
import GeneratePage from "../../app/(dashboard)/generate/page";
import BillingPage from "../../app/(dashboard)/billing/page";

describe("DashboardPage",()=>{
 it("loads KPIs and projects and renders them",async()=>{
  global.fetch=jest.fn()
   .mockResolvedValueOnce({ok:true,json:async()=>({ok:true,data:{activationRatePct:40,generationSuccessRatePct:90,creditsRemainingPct:60}})})
   .mockResolvedValueOnce({ok:true,json:async()=>({ok:true,data:{projects:[{id:"p1",name:"Fall Drop",status:"active",updatedAt:"2026-01-01",frameCount:2}]}})}) as any;

  render(<DashboardPage />);
  expect(screen.getByText("Loading your numbers…")).toBeInTheDocument();
  await waitFor(()=>expect(screen.getByText("40%")).toBeInTheDocument());
  await waitFor(()=>expect(screen.getByText("Fall Drop")).toBeInTheDocument());
 });

 it("shows an empty projects state when there are none",async()=>{
  global.fetch=jest.fn()
   .mockResolvedValueOnce({ok:true,json:async()=>({ok:true,data:{activationRatePct:0,generationSuccessRatePct:100,creditsRemainingPct:100}})})
   .mockResolvedValueOnce({ok:true,json:async()=>({ok:true,data:{projects:[]}})}) as any;
  render(<DashboardPage />);
  await waitFor(()=>expect(screen.getByText("No projects yet")).toBeInTheDocument());
 });
});

describe("GeneratePage",()=>{
 it("starts a generation and shows progress",async()=>{
  global.fetch=jest.fn().mockResolvedValue({ok:true,status:201,json:async()=>({ok:true,data:{stage:"building"}})}) as any;
  render(<GeneratePage />);
  fireEvent.click(screen.getByRole("button",{name:"Generate"}));
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Building the layout."));
 });

 it("shows an insufficient-credits message on a 402",async()=>{
  global.fetch=jest.fn().mockResolvedValue({ok:false,status:402,json:async()=>({ok:false,error:{code:"INSUFFICIENT_CREDITS",message:"You don't have enough credits for this generation."}})}) as any;
  render(<GeneratePage />);
  fireEvent.click(screen.getByRole("button",{name:"Generate"}));
  await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("You don't have enough credits"));
 });
});

describe("BillingPage",()=>{
 it("renders all plans with Starter marked current",()=>{
  render(<BillingPage />);
  expect(screen.getByText("Current plan")).toBeDisabled();
  expect(screen.getByText("Switch to Mid")).toBeInTheDocument();
 });
 it("switches the current plan on selection",()=>{
  render(<BillingPage />);
  fireEvent.click(screen.getByText("Switch to Pro"));
  expect(screen.getByText("Switch to Starter")).toBeInTheDocument();
 });
});
