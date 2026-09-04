/**
 * @jest-environment jsdom
 */
import React from "react";
import {render, screen, fireEvent, waitFor, act} from "@testing-library/react";
import {axe} from "jest-axe";
import {Button} from "@/components/ui/Button";
import {Input, Select, Textarea} from "@/components/ui/Input";
import {Modal} from "@/components/ui/Modal";
import {ToastProvider, useToast} from "@/components/ui/Toast";
import {Badge, EmptyState, ErrorState} from "@/components/ui/States";
import {MetricCard} from "@/components/ui/MetricCard";
import {GenerationProgress} from "@/components/generation/GenerationProgress";

describe("Button", () => {
  it("stays focusable while loading, and reports itself busy", async () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button");
    // Disabling outright would drop it from the tab order mid-interaction.
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
  });

  it("announces what it is doing rather than only spinning", () => {
    render(<Button loading loadingLabel="Starting…">Generate</Button>);
    expect(screen.getByRole("button")).toHaveTextContent("Starting…");
  });

  it("does not fire onClick while loading", () => {
    const onClick = jest.fn();
    render(<Button loading onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("has no accessibility violations across every variant", async () => {
    const {container} = render(
      <>
        {(["primary", "secondary", "outline", "ghost", "ai", "danger", "success"] as const).map(v => (
          <Button key={v} variant={v}>{v}</Button>
        ))}
      </>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("form fields", () => {
  it("associates the label with the control, so it has an accessible name", () => {
    render(<Input label="Email address" />);
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("links hint and error text via aria-describedby", () => {
    render(<Input label="Password" hint="At least 12 characters." error="Too short." />);
    const field = screen.getByLabelText("Password");
    const describedBy = field.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toHaveLength(2);
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("announces a validation error", () => {
    render(<Input label="Email" error="That address isn't valid." />);
    expect(screen.getByRole("alert")).toHaveTextContent("That address isn't valid.");
  });

  it("marks a required field for assistive tech, not only with an asterisk", () => {
    render(<Input label="Email" required />);
    expect(screen.getByText("(required)")).toBeInTheDocument();
  });

  it("has no violations for input, select and textarea together", async () => {
    const {container} = render(
      <>
        <Input label="Name" />
        <Select label="Quality"><option value="a">A</option></Select>
        <Textarea label="Notes" hint="Optional." />
      </>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Modal", () => {
  function Harness() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open dialog</button>
        <Modal open={open} onClose={() => setOpen(false)} title="Confirm" description="This cannot be undone.">
          <button data-autofocus>Inside first</button>
          <button>Inside last</button>
        </Modal>
      </>
    );
  }

  it("exposes itself as a labelled modal dialog", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open dialog"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Confirm");
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
  });

  it("moves focus into the dialog on open", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open dialog"));
    await waitFor(() => expect(screen.getByText("Inside first")).toHaveFocus());
  });

  it("closes on Escape", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open dialog"));
    fireEvent.keyDown(document, {key: "Escape"});
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("returns focus to whatever opened it", async () => {
    render(<Harness />);
    const trigger = screen.getByText("Open dialog");
    // A real browser focuses a button when it is clicked; jsdom's fireEvent does not,
    // so focus it explicitly or the dialog has nothing to restore to.
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, {key: "Escape"});
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("wraps Tab at the end of the dialog so focus cannot escape", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open dialog"));
    const last = screen.getByText("Inside last");
    last.focus();
    fireEvent.keyDown(document, {key: "Tab"});
    await waitFor(() => expect(screen.getByText("Inside first")).toHaveFocus());
  });

  it("has no accessibility violations while open", async () => {
    const {container} = render(<Harness />);
    fireEvent.click(screen.getByText("Open dialog"));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Toast", () => {
  function Harness({tone}: {tone: "success" | "danger"}) {
    const {push} = useToast();
    return <button onClick={() => push({tone, title: "Saved", description: "All good."})}>Fire</button>;
  }

  it("announces a success politely, so it cannot interrupt", () => {
    render(<ToastProvider><Harness tone="success" /></ToastProvider>);
    fireEvent.click(screen.getByText("Fire"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("announces a failure assertively", () => {
    render(<ToastProvider><Harness tone="danger" /></ToastProvider>);
    fireEvent.click(screen.getByText("Fire"));
    expect(screen.getByRole("alert")).toHaveTextContent("Saved");
  });

  it("auto-dismisses a success but keeps an error until dismissed", () => {
    jest.useFakeTimers();
    const {rerender} = render(<ToastProvider><Harness tone="success" /></ToastProvider>);
    fireEvent.click(screen.getByText("Fire"));
    act(() => { jest.advanceTimersByTime(7000); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<ToastProvider><Harness tone="danger" /></ToastProvider>);
    fireEvent.click(screen.getByText("Fire"));
    act(() => { jest.advanceTimersByTime(30000); });
    // Auto-hiding a failure the user may not have read is how people miss that
    // their work did not save.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    jest.useRealTimers();
  });
});

describe("state components", () => {
  it("announces an error state", () => {
    render(<ErrorState description="Couldn't load your projects." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your projects.");
  });

  it("renders an empty state with its action", () => {
    render(<EmptyState title="No projects yet" description="Create your first." action={<Button>Create</Button>} />);
    expect(screen.getByRole("heading", {name: "No projects yet"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Create"})).toBeInTheDocument();
  });

  it("conveys status in text, never by colour alone", () => {
    render(<Badge tone="danger">failed</Badge>);
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("gives a loading metric an accessible label", () => {
    render(<MetricCard loading label="Credits remaining" value="—" hint="" />);
    expect(screen.getByText("Loading Credits remaining")).toBeInTheDocument();
  });
});

describe("GenerationProgress", () => {
  it("announces the current stage through a live region", () => {
    render(<GenerationProgress stage="generating_assets" />);
    expect(screen.getByRole("status")).toHaveTextContent("Generating assets.");
  });

  it("announces a failure and shows the reason", () => {
    render(<GenerationProgress stage="failed" error="The image service was busy." />);
    expect(screen.getByRole("alert")).toHaveTextContent("The image service was busy.");
  });

  it("has no accessibility violations", async () => {
    const {container} = render(<GenerationProgress stage="building" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
