/**
 * @jest-environment jsdom
 */
import React from "react";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {axe} from "jest-axe";
import {BasketScreen} from "@/components/storefront/BasketScreen";
import {OrderConfirmation} from "@/components/storefront/OrderConfirmation";
import {CART_TOKEN_KEY} from "@/components/storefront/cartToken";

const ok = (data: unknown) => ({ok: true, status: 200, json: async () => ({ok: true, data})});
const fail = (status: number, code: string, message: string) =>
  ({ok: false, status, json: async () => ({ok: false, error: {code, message}})});

const TOKEN = "a".repeat(48);

const quote = (over: Record<string, unknown> = {}) => ({
  cartId: "cart-1",
  stores: [{
    storeId: "store-1",
    lines: [{
      cartItemId: "item-1", variantId: "var-1", storeId: "store-1",
      title: "Merino Scarf", sku: "SCARF-GREY", quantity: 2, unitPrice: 2499,
    }],
    totals: {subtotal: 4998, discountTotal: 0, shippingTotal: 0, taxTotal: 0, total: 4998},
    discountCode: null,
  }],
  grandTotal: 4998,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe("basket", () => {
  it("says the basket is empty rather than showing an error, when no basket exists", async () => {
    // A visitor who has never added anything has no token at all. That is a normal
    // state, not a failure, and must not look like one.
    global.fetch = jest.fn() as unknown as typeof fetch;
    render(<BasketScreen slug="probe-shop" />);
    expect(await screen.findByText("Your basket is empty")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("prices the basket and shows what each line costs", async () => {
    localStorage.setItem(CART_TOKEN_KEY, TOKEN);
    global.fetch = jest.fn().mockResolvedValue(ok(quote())) as unknown as typeof fetch;

    render(<BasketScreen slug="probe-shop" />);
    expect(await screen.findByText("Merino Scarf")).toBeInTheDocument();
    expect(screen.getByText("$24.99 each")).toBeInTheDocument();
    // $49.98 is both the line total and the basket total here, so both must render.
    expect(screen.getAllByText("$49.98")).toHaveLength(3);
  });

  it("explains exactly why a discount code was refused", async () => {
    localStorage.setItem(CART_TOKEN_KEY, TOKEN);
    const refused = quote();
    (refused.stores[0] as Record<string, unknown>).discountError = "DISCOUNT_EXPIRED";
    global.fetch = jest.fn().mockResolvedValue(ok(refused)) as unknown as typeof fetch;

    render(<BasketScreen slug="probe-shop" />);
    // Silently dropping the code would leave them paying full price wondering why.
    expect(await screen.findByRole("alert")).toHaveTextContent("That code has expired.");
  });

  it("removing the last item empties the basket", async () => {
    localStorage.setItem(CART_TOKEN_KEY, TOKEN);
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(ok(quote()))
      .mockResolvedValueOnce(ok({removed: true}))
      .mockResolvedValueOnce(ok({cartId: null, stores: [], grandTotal: 0}));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<BasketScreen slug="probe-shop" />);
    const remove = await screen.findByRole("button", {name: /Remove Merino Scarf/});
    await userEvent.click(remove);

    expect(await screen.findByText("Your basket is empty")).toBeInTheDocument();
    // Quantity zero is how the API expresses removal.
    const patch = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === "PATCH");
    expect(JSON.parse((patch![1] as RequestInit).body as string)).toMatchObject({quantity: 0});
  });

  it("shows a failure instead of an empty basket when pricing fails", async () => {
    localStorage.setItem(CART_TOKEN_KEY, TOKEN);
    global.fetch = jest.fn()
      .mockResolvedValue(fail(500, "BOOM", "We couldn't load your basket.")) as unknown as typeof fetch;

    render(<BasketScreen slug="probe-shop" />);
    // Rendering "empty" on a server error tells the shopper their items are gone.
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your basket.");
  });

  it("has no accessibility violations", async () => {
    localStorage.setItem(CART_TOKEN_KEY, TOKEN);
    global.fetch = jest.fn().mockResolvedValue(ok(quote())) as unknown as typeof fetch;

    const {container} = render(<BasketScreen slug="probe-shop" />);
    await screen.findByText("Merino Scarf");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("order confirmation", () => {
  it("will not show an order from the link alone", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    render(<OrderConfirmation groupId="11111111-1111-4111-8111-111111111111" slug="probe-shop" />);

    // The group id travels in the URL, so it reaches history, referrers and anyone
    // the link is pasted to. The email is what stops a leaked link exposing an
    // address and a purchase history.
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.queryByText(/Thank you/)).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the order once the email matches", async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({
      id: "11111111-1111-4111-8111-111111111111",
      email: "shopper@example.com",
      createdAt: new Date().toISOString(),
      orders: [{
        id: "o1", orderNumber: 1001, status: "paid", total: 4998,
        storeName: "Probe Shop", storeSlug: "probe-shop",
        items: [{id: "i1", title: "Merino Scarf", quantity: 2, unitPrice: 2499}],
      }],
    })) as unknown as typeof fetch;

    render(<OrderConfirmation groupId="11111111-1111-4111-8111-111111111111" slug="probe-shop" />);
    await userEvent.type(screen.getByLabelText(/Email/), "shopper@example.com");
    await userEvent.click(screen.getByRole("button", {name: "View my order"}));

    expect(await screen.findByText("Thank you")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    // The line and the order total both show it.
    expect(screen.getAllByText("$49.98").length).toBeGreaterThanOrEqual(1);
  });

  it("does not claim payment is confirmed while it is still pending", async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({
      id: "11111111-1111-4111-8111-111111111111",
      email: "shopper@example.com",
      createdAt: new Date().toISOString(),
      orders: [{
        id: "o1", orderNumber: 1001, status: "pending_payment", total: 4998,
        storeName: "Probe Shop", storeSlug: "probe-shop", items: [],
      }],
    })) as unknown as typeof fetch;

    render(<OrderConfirmation groupId="11111111-1111-4111-8111-111111111111" slug="probe-shop" />);
    await userEvent.type(screen.getByLabelText(/Email/), "shopper@example.com");
    await userEvent.click(screen.getByRole("button", {name: "View my order"}));

    // The webhook is what confirms payment. Saying "confirmed" before it lands
    // would tell a shopper their card cleared when it may still fail.
    await waitFor(() => expect(screen.getByText(/still confirming your payment/i)).toBeInTheDocument());
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
  });

  it("gives the same answer for a wrong email as for an unknown order", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      fail(404, "ORDER_NOT_FOUND", "We couldn't find an order with that reference and email.")
    ) as unknown as typeof fetch;

    render(<OrderConfirmation groupId="11111111-1111-4111-8111-111111111111" slug="probe-shop" />);
    await userEvent.type(screen.getByLabelText(/Email/), "wrong@example.com");
    await userEvent.click(screen.getByRole("button", {name: "View my order"}));

    // One message for both cases, so this cannot be used to test whether an order
    // id exists.
    expect(await screen.findByRole("alert"))
      .toHaveTextContent("We couldn't find an order with that reference and email.");
  });
});
