import {send, buildReceipt, buildMerchantNotification} from "@/core/email/emailService";

const order = {
  orderNumber: 1042,
  storeName: "Probe Shop",
  items: [{title: "Merino Scarf", quantity: 2, unitPrice: 2499}],
  subtotal: 4998, discountTotal: 500, shippingTotal: 599, taxTotal: 420, total: 5517,
};

describe("sending", () => {
  const original = process.env.RESEND_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = original;
  });

  it("reports that it skipped rather than claiming success when unconfigured", async () => {
    // Returning ok here is how a merchant ends up believing customers received
    // receipts that were never sent.
    delete process.env.RESEND_API_KEY;
    const result = await send({to: "a@b.com", subject: "s", html: "<p>h</p>", text: "t"});
    expect(result).toEqual({ok: false, skipped: true, reason: "NOT_CONFIGURED"});
  });

  it("returns a failure instead of throwing, so a paid order is never rolled back", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({message: "Invalid recipient"}),
    });
    const result = await send(
      {to: "bad", subject: "s", html: "<p>h</p>", text: "t"},
      {fetchImpl: fetchImpl as unknown as typeof fetch}
    );
    expect(result).toEqual({ok: false, skipped: false, reason: "Invalid recipient"});
  });

  it("survives the network being down", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchImpl = jest.fn().mockRejectedValue(new Error("ECONNRESET"));
    const result = await send(
      {to: "a@b.com", subject: "s", html: "<p>h</p>", text: "t"},
      {fetchImpl: fetchImpl as unknown as typeof fetch}
    );
    expect(result).toEqual({ok: false, skipped: false, reason: "ECONNRESET"});
  });

  it("sends what Resend expects", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchImpl = jest.fn().mockResolvedValue({ok: true, status: 200, json: async () => ({id: "em_1"})});
    const result = await send(
      {to: "a@b.com", subject: "Receipt", html: "<p>h</p>", text: "t"},
      {fetchImpl: fetchImpl as unknown as typeof fetch}
    );
    expect(result).toEqual({ok: true, id: "em_1"});
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.to).toEqual(["a@b.com"]);
    expect(body.subject).toBe("Receipt");
    // Both parts, always: an HTML-only receipt is a blank message in a text client.
    expect(body.html).toBeTruthy();
    expect(body.text).toBeTruthy();
  });
});

describe("the receipt", () => {
  const message = buildReceipt({email: "shopper@example.com", order, orderUrl: "https://x.test/o/1"});

  it("names the order and the seller in the subject", () => {
    expect(message.subject).toBe("Your order #1042 from Probe Shop");
  });

  it("shows every line the customer was charged", () => {
    for (const part of ["Merino Scarf", "Subtotal", "Discount", "Shipping", "Tax", "Total"]) {
      expect(message.html).toContain(part);
    }
    expect(message.html).toContain("$55.17");
  });

  it("omits lines that are zero rather than showing a row of $0.00", () => {
    const plain = buildReceipt({
      email: "a@b.com", orderUrl: "https://x.test/o/2",
      order: {...order, discountTotal: 0, shippingTotal: 0, taxTotal: 0, total: 4998},
    });
    expect(plain.html).not.toContain("Discount");
    expect(plain.html).not.toContain("Shipping");
    expect(plain.text).not.toContain("Discount");
  });

  it("escapes product titles, which merchants control", () => {
    // A title is merchant-supplied text landing in an email client that will
    // happily render markup.
    const hostile = buildReceipt({
      email: "a@b.com", orderUrl: "https://x.test/o/3",
      order: {...order, items: [{title: '<img src=x onerror="alert(1)">', quantity: 1, unitPrice: 100}]},
    });
    expect(hostile.html).not.toContain("<img src=x");
    expect(hostile.html).toContain("&lt;img");
  });

  it("carries a plain-text version that stands on its own", () => {
    expect(message.text).toContain("Merino Scarf x 2");
    expect(message.text).toContain("Total: $55.17");
    expect(message.text).toContain("https://x.test/o/1");
  });
});

describe("the merchant notification", () => {
  it("leads with what they need to know: how many, and how much", () => {
    const message = buildMerchantNotification({
      email: "merchant@example.com", order, orderUrl: "https://x.test/orders/1",
    });
    expect(message.subject).toBe("New order #1042 — $55.17");
    expect(message.text).toContain("2 items");
  });

  it("says 'item' rather than 'items' for a single one", () => {
    const message = buildMerchantNotification({
      email: "m@example.com", orderUrl: "https://x.test/orders/2",
      order: {...order, items: [{title: "Scarf", quantity: 1, unitPrice: 2499}]},
    });
    expect(message.text).toContain("1 item,");
  });
});
