/**
 * @jest-environment jsdom
 */
import React from "react";
import {render,screen,fireEvent} from "@testing-library/react";
import {Sidebar} from "../../components/shell/Sidebar";
import {Topbar} from "../../components/shell/Topbar";
import {AppShell} from "../../components/shell/AppShell";

const items=[
 {id:"dashboard",label:"Dashboard",href:"/dashboard",icon:<span>D</span>},
 {id:"generate",label:"Generate",href:"/generate",icon:<span>G</span>},
];

describe("Sidebar",()=>{
 it("renders every nav item and marks the active one",()=>{
  render(<Sidebar items={items} activeId="generate" collapsed={false} storeName="Northwind" />);
  expect(screen.getByText("Dashboard")).toBeInTheDocument();
  const active=screen.getByText("Generate").closest("a");
  expect(active).toHaveAttribute("aria-current","page");
 });
 it("hides labels but keeps them reachable when collapsed",()=>{
  render(<Sidebar items={items} activeId="dashboard" collapsed={true} storeName="Northwind" />);
  expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(2);
 });
});

describe("Topbar",()=>{
 it("shows project, frame count and credits, and fires theme change",()=>{
  const onThemeChange=jest.fn();
  render(<Topbar projectName="Summer Launch" assetCount={12} creditsRemaining={340} theme="daylight" onThemeChange={onThemeChange} />);
  expect(screen.getByText("Summer Launch")).toBeInTheDocument();
  expect(screen.getByText("12 frames")).toBeInTheDocument();
  expect(screen.getByText("340 credits")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox"),{target:{value:"blackout"}});
  expect(onThemeChange).toHaveBeenCalledWith("blackout");
 });
 it("falls back to a placeholder when no project is selected",()=>{
  render(<Topbar creditsRemaining={0} theme="daylight" onThemeChange={()=>{}} />);
  expect(screen.getByText("No project selected")).toBeInTheDocument();
 });
});

describe("AppShell",()=>{
 it("renders a skip link, sidebar, topbar and children together",()=>{
  render(
   <AppShell
    items={items} activeId="dashboard" sidebarCollapsed={false} storeName="Northwind"
    creditsRemaining={100} theme="daylight" onThemeChange={()=>{}}
   >
    <p>Page content</p>
   </AppShell>
  );
  expect(screen.getByText("Skip to content")).toBeInTheDocument();
  expect(screen.getByText("Page content")).toBeInTheDocument();
  expect(screen.getByText("Northwind")).toBeInTheDocument();
 });
});
