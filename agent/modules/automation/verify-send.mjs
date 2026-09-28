// Send the REAL rendered campaign email through Mailpit, fetch it back
// via REST, and verify subject/body/recipient BEFORE any live send.
// Run from the outreach project root (resolves nodemailer from its node_modules).
// Usage: node verify-send.mjs [--stale]   (--stale simulates the stale-content incident)
// Adapt section 1 per campaign: render via the project's real pipeline, not inline fixtures.
import { createRequire } from "node:module";
import { join } from "node:path";
const require = createRequire(join(process.cwd(), "package.json"));
const nodemailer = require("nodemailer");

const MAILPIT_SMTP = { host: "127.0.0.1", port: 1025 };
const MAILPIT_API = "http://127.0.0.1:8025/api/v1";

// --- 1. Render the campaign exactly like the production pipeline would ---
const lead = { name: "Jane Doe", email: "jane@example.com", company: "Acme" };
const campaign = { id: "camp_2026_08_w4", offerDate: "2026-08-28" };
const stale = process.argv.includes("--stale");
const rendered = {
  subject: `Quick question about ${lead.company}`,
  html: stale
    ? `<p>Hi {{name}},</p><p>Our offer expires 2026-07-15.</p>` // stale template, unreplaced var
    : `<p>Hi ${lead.name},</p><p>Our offer expires ${campaign.offerDate}.</p>`,
};

// --- 2. Send it to Mailpit instead of the live relay ---
const transport = nodemailer.createTransport(MAILPIT_SMTP);
const info = await transport.sendMail({
  from: "outreach@mydomain.test",
  to: lead.email,
  subject: rendered.subject,
  html: rendered.html,
  headers: { "X-Campaign-Id": campaign.id },
});

// --- 3. Fetch the captured message back via REST (search by SMTP message-id) ---
const search = await (
  await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent("message-id:" + info.messageId)}`)
).json();
if (search.messages_count !== 1) throw new Error("captured message not found in Mailpit");
const msg = await (await fetch(`${MAILPIT_API}/message/${search.messages[0].ID}`)).json();

// --- 4. Verify what was ACTUALLY sent, not what we intended ---
const checks = [
  ["recipient", msg.To[0].Address === lead.email],
  ["subject exact match", msg.Subject === rendered.subject],
  ["campaign header", (await (await fetch(`${MAILPIT_API}/message/${search.messages[0].ID}/headers`)).json())["X-Campaign-Id"]?.[0] === campaign.id],
  ["no unreplaced template vars", !/{{\s*\w+\s*}}/.test(msg.HTML)],
  ["lead name present", msg.HTML.includes(lead.name)],
  ["offer date is current", msg.HTML.includes(campaign.offerDate)],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
console.log(JSON.stringify({ verdict: failed ? "BLOCK_LIVE_SEND" : "OK_TO_SEND", failed, mailpitId: search.messages[0].ID }));
process.exit(failed ? 1 : 0);
