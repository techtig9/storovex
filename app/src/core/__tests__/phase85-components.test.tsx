/**
 * @jest-environment jsdom
 */
import React from "react";
import {render,screen,fireEvent} from "@testing-library/react";
import {KpiGrid,kpiCardsFromSummary} from "../../components/dashboard/KpiGrid";
import {ProjectContactSheet} from "../../components/dashboard/ProjectContactSheet";
import {GenerationProgress} from "../../components/generation/GenerationProgress";
import {GenerationForm} from "../../components/generation/GenerationForm";
import {PlanCard} from "../../components/billing/PlanCard";

describe("KpiGrid",()=>{
 it("renders a card per KPI derived from a dashboard summary",()=>{
  const cards=kpiCardsFromSummary({activationRatePct:50,generationSuccessRatePct:80,creditsRemainingPct:25});
  render(<KpiGrid cards={cards} />);
  expect(screen.getByText("50%")).toBeInTheDocument();
  expect(screen.getByText("80%")).toBeInTheDocument();
  expect(screen.getByText("25%")).toBeInTheDocument();
 });
});

describe("ProjectContactSheet",()=>{
 it("shows an empty state with no projects",()=>{
  render(<ProjectContactSheet projects={[]} onOpen={()=>{}} />);
  expect(screen.getByText("No projects yet")).toBeInTheDocument();
 });
 it("renders each project as a frame and opens it on click",()=>{
  const onOpen=jest.fn();
  render(<ProjectContactSheet projects={[{id:"p1",name:"Summer Launch",status:"active",updatedAt:"2026-01-01",frameCount:4}]} onOpen={onOpen} />);
  expect(screen.getByText("Summer Launch")).toBeInTheDocument();
  expect(screen.getByText("frame 01")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Summer Launch"));
  expect(onOpen).toHaveBeenCalledWith("p1");
 });
});

describe("GenerationProgress",()=>{
 it("announces the current stage for screen readers",()=>{
  render(<GenerationProgress stage="generating_assets" />);
  expect(screen.getByRole("status")).toHaveTextContent("Generating assets.");
 });
 it("announces failure distinctly",()=>{
  render(<GenerationProgress stage="failed" />);
  expect(screen.getByRole("status")).toHaveTextContent("Generation failed.");
 });
});

describe("GenerationForm",()=>{
 it("shows a live credit estimate and submits the chosen options",()=>{
  const onSubmit=jest.fn();
  render(<GenerationForm onSubmit={onSubmit} submitting={false} />);
  expect(screen.getByText(/Estimated cost: 8 credits/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("How many"),{target:{value:"3"}});
  expect(screen.getByText(/Estimated cost: 24 credits/)).toBeInTheDocument();
  fireEvent.click(screen.getByText("Generate"));
  expect(onSubmit).toHaveBeenCalledWith({type:"product_hero",quality:"standard",count:3});
 });
});

describe("PlanCard",()=>{
 it("shows the monthly price and included credits",()=>{
  render(<PlanCard planId="starter" cycle="monthly" current={false} onSelect={()=>{}} />);
  expect(screen.getByText("Starter")).toBeInTheDocument();
  expect(screen.getByText("400 credits included")).toBeInTheDocument();
 });
 it("disables selection and labels the current plan",()=>{
  render(<PlanCard planId="pro" cycle="monthly" current={true} onSelect={()=>{}} />);
  expect(screen.getByText("Current plan")).toBeDisabled();
 });
});
