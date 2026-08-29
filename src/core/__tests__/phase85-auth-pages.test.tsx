/**
 * @jest-environment jsdom
 */
import React from "react";
import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import LoginPage from "../../app/(auth)/login/page";
import SignupPage from "../../app/(auth)/signup/page";

function mockFetchOnce(ok:boolean){
 global.fetch=jest.fn().mockResolvedValue({ok,json:async()=>({})}) as any;
}

describe("LoginPage",()=>{
 it("renders the form and submits credentials",async()=>{
  mockFetchOnce(true);
  const original=window.location;
  // jsdom doesn't implement navigation; stub location so a successful submit doesn't crash the test.
  // @ts-expect-error - test-only override of a readonly global
  delete window.location;
  (window as any).location={href:""};

  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText("Email"),{target:{value:"ada@example.com"}});
  fireEvent.change(screen.getByLabelText("Password"),{target:{value:"correcthorse"}});
  fireEvent.click(screen.getByRole("button",{name:"Log in"}));

  await waitFor(()=>expect(global.fetch).toHaveBeenCalledWith("/api/auth/login",expect.objectContaining({method:"POST"})));
  (window as any).location=original;
 });

 it("shows an error message when the request fails",async()=>{
  mockFetchOnce(false);
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText("Email"),{target:{value:"ada@example.com"}});
  fireEvent.change(screen.getByLabelText("Password"),{target:{value:"wrongpass"}});
  fireEvent.click(screen.getByRole("button",{name:"Log in"}));
  await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Couldn't log you in"));
 });
});

describe("SignupPage",()=>{
 it("renders the create-account form",()=>{
  render(<SignupPage />);
  expect(screen.getByText("Create your account")).toBeInTheDocument();
  expect(screen.getByText("Create account")).toBeInTheDocument();
 });
 it("shows an error message when signup fails",async()=>{
  mockFetchOnce(false);
  render(<SignupPage />);
  fireEvent.change(screen.getByLabelText("Email"),{target:{value:"ada@example.com"}});
  fireEvent.change(screen.getByLabelText("Password"),{target:{value:"correcthorse"}});
  fireEvent.click(screen.getByRole("button",{name:"Create account"}));
  await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Couldn't create your account"));
 });
});
