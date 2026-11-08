// A local stand-in for the parts of Paystack's API ISOLA uses, following
// Paystack's documented request/response shapes. Start the app with
//   PAYSTACK_SECRET_KEY=sk_test_isola_e2e PAYSTACK_API_BASE=http://127.0.0.1:4010
import http from "node:http";
import { createHmac } from "node:crypto";

export const TEST_SECRET = "sk_test_isola_e2e";

export async function startFakePaystack({ port = Number(process.env.PAYSTACK_TEST_PORT || 4010), secret = TEST_SECRET } = {}) {
  const txs = new Map();
  const base = `http://127.0.0.1:${port}`;
  const read = (req) => new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
  });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base);
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    // Browser-facing hosted checkout: "pays" and returns to the callback URL.
    if (url.pathname.startsWith("/checkout/")) {
      const tx = txs.get(decodeURIComponent(url.pathname.slice("/checkout/".length)));
      if (!tx) return send(404, { status: false, message: "Unknown checkout" });
      tx.status = "success";
      tx.paid_at = new Date().toISOString();
      res.writeHead(302, { location: `${tx.callback_url}?trxref=${tx.reference}&reference=${tx.reference}` });
      return res.end();
    }
    if (url.pathname.startsWith("/manage/")) return send(200, { status: true, message: "Manage page" });
    if (req.headers.authorization !== `Bearer ${secret}`) return send(401, { status: false, message: "Invalid key" });
    if (req.method === "POST" && url.pathname === "/transaction/initialize") {
      const body = JSON.parse(await read(req));
      txs.set(body.reference, { ...body, amount: Number(body.amount), status: "abandoned", customer_code: `CUS_${body.reference.slice(-8)}` });
      return send(200, {
        status: true,
        message: "Authorization URL created",
        data: { authorization_url: `${base}/checkout/${body.reference}`, access_code: `ac_${body.reference.slice(-6)}`, reference: body.reference },
      });
    }
    const verify = url.pathname.match(/^\/transaction\/verify\/(.+)$/);
    if (req.method === "GET" && verify) {
      const tx = txs.get(decodeURIComponent(verify[1]));
      if (!tx) return send(400, { status: false, message: "Transaction reference not found" });
      return send(200, {
        status: true,
        message: "Verification successful",
        data: {
          status: tx.status,
          reference: tx.reference,
          amount: tx.amountPaid ?? tx.amount,
          currency: tx.currency,
          paid_at: tx.paid_at ?? null,
          metadata: tx.metadata,
          customer: { email: tx.email, customer_code: tx.customer_code },
          plan: tx.plan ?? null,
        },
      });
    }
    const manage = url.pathname.match(/^\/subscription\/(.+)\/manage\/link$/);
    if (req.method === "GET" && manage) return send(200, { status: true, message: "Link generated", data: { link: `${base}/manage/${manage[1]}` } });
    return send(404, { status: false, message: "Not found" });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    base,
    txs,
    /** Mark a transaction paid without going through the browser redirect. */
    complete(reference, patch = {}) {
      Object.assign(txs.get(reference), { status: "success", paid_at: new Date().toISOString() }, patch);
    },
    /** POST a webhook to the app, signed the way Paystack signs it (or not, if `signature` is given). */
    async webhook(appBase, event, signature) {
      const raw = JSON.stringify(event);
      const sig = signature ?? createHmac("sha512", secret).update(raw).digest("hex");
      return fetch(`${appBase}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-paystack-signature": sig }, body: raw });
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Upgrade the account signed in to `context` by going through checkout. */
export async function upgradeToPro(context, appBase) {
  const res = await context.request.post(`${appBase}/api/billing/checkout`, { headers: { origin: appBase } });
  if (!res.ok()) throw new Error(`Checkout failed: HTTP ${res.status()} ${await res.text()}`);
  const { url } = await res.json();
  const final = await context.request.get(url);
  return { reference: new URL(url).pathname.split("/").pop(), finalUrl: final.url() };
}

export async function proUntil(context, appBase) {
  const session = await (await context.request.get(`${appBase}/api/auth/get-session`)).json();
  return session?.user?.proUntil ? new Date(session.user.proUntil).getTime() : null;
}
