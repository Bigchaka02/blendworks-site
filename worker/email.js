/* Outbound e-mail through Resend (https://resend.com — free tier 3,000/month) and the contact-form handler.
   Sends are skipped, with a console line, until the founder adds the RESEND_API_KEY secret in the Worker dashboard;
   EMAIL_FROM and CONTACT_EMAIL are public vars in wrangler.jsonc. The domain's inbound mail (replies, the contact
   address) reaches the founder through Cloudflare Email Routing, not through this code. */
import { HttpError, json, guard, readJson, str, normEmail, validEmail, ip } from "./lib.js";
import { assertRate, recordAttempt } from "./auth.js";

export const emailEnabled = (env) => !!(env.RESEND_API_KEY && env.EMAIL_FROM);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function sendEmail(env, to, subject, html, extra = {}) {
  if (!emailEnabled(env)) { console.log("email skipped (RESEND_API_KEY not set):", subject); return false; }
  const body = { from: env.EMAIL_FROM, to, subject, html };
  if (extra.replyTo) body.reply_to = extra.replyTo;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) console.error("email failed", res.status, (await res.text()).slice(0, 300));
  return res.ok;
}
// Plain, client-safe HTML wrapper shared by order, account and contact mails.
export const layout = (title, body, foot) =>
  `<div style="font-family:Inter,Segoe UI,sans-serif;color:#111;max-width:560px;line-height:1.5"><h2 style="margin:0 0 12px">${title}</h2>${body}<p style="color:#777;font-size:12px;margin-top:24px">BlendWorks${foot ? " · " + foot : ""}</p></div>`;
export const button = (href, label) => `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#56B4F2;color:#0B1020;font-weight:600;text-decoration:none">${esc(label)}</a></p><p style="color:#777;font-size:12px">Or paste this link into your browser:<br>${esc(href)}</p>`;

/* ---------- contact form -> the shop's inbox (reply-to = the customer) ---------- */
const TOPICS = ["General question", "Order or shipping", "Ingredients & doses", "Report a problem with a product", "Wholesale / coaches"];
export const contact = guard(async (request, env) => {
  const body = await readJson(request);
  if (str(body.website, 100)) return json({ ok: true });   // honeypot field filled in: a bot — say nothing
  const name = str(body.name, 80), email = normEmail(body.email), message = str(body.message, 4000), topic = TOPICS.includes(body.topic) ? body.topic : TOPICS[0];
  if (name.length < 2) throw new HttpError(400, "Enter your name.");
  if (!validEmail(email)) throw new HttpError(400, "Enter a valid email address so we can reply.");
  if (message.length < 10) throw new HttpError(400, "Tell us a little more — at least a sentence.");
  await assertRate(env, "contact:ip", ip(request));
  if (!emailEnabled(env)) throw new HttpError(503, `The contact form isn't switched on yet — please e-mail us at ${env.CONTACT_EMAIL || "our contact address"} instead.`);
  await recordAttempt(env, "contact:ip", ip(request));
  const to = env.CONTACT_EMAIL || env.EMAIL_FROM.replace(/^.*<|>$/g, "");
  const html = layout(`${esc(topic)} — from ${esc(name)}`, `<p><b>${esc(name)}</b> &lt;${esc(email)}&gt;</p><p style="white-space:pre-wrap">${esc(message)}</p>`, "contact form · reply to answer the customer directly");
  const ok = await sendEmail(env, to, `[Contact] ${topic} — ${name}`, html, { replyTo: email });
  if (!ok) throw new HttpError(502, `We couldn't send your message just now — please e-mail us at ${to}.`);
  return json({ ok: true });
});
