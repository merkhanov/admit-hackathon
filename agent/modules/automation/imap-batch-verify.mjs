// TEMPLATE: post-batch IMAP verification (no new tool needed — user already ships imapflow).
// Run after a send batch: confirms each queued message actually landed in the Sent
// folder and sweeps the inbox for bounces, returning a JSON verdict for the monitor.
// Usage: node imap-batch-verify.mjs <batch.json>
//   batch.json: { "sentAfter": "2026-08-26T09:00:00Z",
//                 "expected": [{ "to": "jane@example.com", "messageId": "<abc@mydomain>" }] }
// Env: IMAP_HOST, IMAP_USER, IMAP_PASS (read-only mailbox creds — never the send key)
import { ImapFlow } from "imapflow";
import { readFileSync } from "node:fs";

const batch = JSON.parse(readFileSync(process.argv[2], "utf8"));
const client = new ImapFlow({
  host: process.env.IMAP_HOST,
  port: 993,
  secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
  logger: false,
});

const BOUNCE_SUBJECT = /undeliver|delivery status|mail delivery|returned mail|failure notice/i;
const result = { verdict: "OK", sentConfirmed: [], sentMissing: [], bounces: [] };

await client.connect();
try {
  // 1. Confirm every expected Message-ID exists in the Sent folder.
  const sent = await client.getMailboxLock("[Gmail]/Sent Mail").catch(() => client.getMailboxLock("Sent"));
  try {
    for (const exp of batch.expected) {
      const hits = await client.search({ header: { "message-id": exp.messageId } });
      (hits?.length ? result.sentConfirmed : result.sentMissing).push(exp);
    }
  } finally {
    sent.release();
  }

  // 2. Sweep INBOX for bounces newer than the batch start.
  const inbox = await client.getMailboxLock("INBOX");
  try {
    const recent = (await client.search({ since: new Date(batch.sentAfter) })) || [];
    for await (const msg of client.fetch(recent, { envelope: true })) {
      const from = msg.envelope.from?.[0]?.address ?? "";
      if (BOUNCE_SUBJECT.test(msg.envelope.subject ?? "") || /mailer-daemon|postmaster/i.test(from)) {
        result.bounces.push({ subject: msg.envelope.subject, from, date: msg.envelope.date });
      }
    }
  } finally {
    inbox.release();
  }
} finally {
  await client.logout().catch(() => {});
}

if (result.sentMissing.length) result.verdict = "CRITICAL_MISSING_SENDS"; // send window missed / silent failure
else if (result.bounces.length > batch.expected.length * 0.1) result.verdict = "WARN_HIGH_BOUNCE";
console.log(JSON.stringify(result, null, 2));
process.exit(result.verdict === "OK" ? 0 : 1);
