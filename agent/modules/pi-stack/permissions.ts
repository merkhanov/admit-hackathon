/**
 * Harness permissions extension — ports the Claude Code allow/ask/deny model to pi.
 *
 * Policy (mirrors ~/.claude settings + outreach repo seams):
 *   DENY  — reading/printing .env* secrets (read tool AND bash cat/grep/etc.), rm -rf outside repo, sudo
 *   ASK   — live-send / go-live / cutover / campaign commands (outreach safety seam), force-push, hard reset
 *   ALLOW — everything else (pi default)
 * Headless (-p / --mode json / rpc without UI): ASK degrades to BLOCK — unattended runs never approve sends.
 * The Mailpit verify-send gate remains the authoritative pre-send check; this is the second lock, not the first.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ENV_FILE = /(^|[\s/'"])\.env(\.[\w.-]+)?\b/;
const DENY_BASH: { pattern: RegExp; reason: string }[] = [
	{ pattern: /\b(cat|less|more|head|tail|bat|grep|rg|strings|xxd|base64)\b[^|;&]*\.env/i, reason: "reading .env secrets is denied" },
	{ pattern: /\bsudo\b/i, reason: "sudo is denied" },
	{ pattern: /\brm\s+(-\w*[rf]\w*\s+)+\/(?!Users\/\w+\/conductor)/i, reason: "recursive delete outside workspace tree is denied" },
];
const ASK_BASH: { pattern: RegExp; label: string }[] = [
	{ pattern: /\bnpm\s+run\s+(go-live|campaign(?!:seed)|cutover|outreach:(run|release-link))/i, label: "outreach live command" },
	{ pattern: /--(send|live)\b/i, label: "live-send flag" },
	{ pattern: /\bgit\s+push\s+.*(--force|-f)\b/i, label: "force push" },
	{ pattern: /\bgit\s+reset\s+--hard/i, label: "hard reset" },
	{ pattern: /\bnode\s+--env-file[^\n]*prod/i, label: "prod env injection" },
];

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		// Gate secret READS through the read tool as well — bash-only gating leaves the read tool open.
		if (event.toolName === "read") {
			const p = String(event.input.path ?? "");
			if (ENV_FILE.test(p) && !p.endsWith(".env.example")) {
				return { block: true, reason: `read of "${p}" denied (.env policy)` };
			}
			return undefined;
		}
		if (event.toolName === "write" || event.toolName === "edit") {
			const p = String(event.input.path ?? "");
			if (ENV_FILE.test(p) && !p.endsWith(".env.example")) {
				return { block: true, reason: `write to "${p}" denied (.env policy)` };
			}
			return undefined;
		}
		if (event.toolName !== "bash") return undefined;

		const command = String(event.input.command ?? "");
		for (const d of DENY_BASH) {
			if (d.pattern.test(command)) return { block: true, reason: `Denied: ${d.reason}` };
		}
		for (const a of ASK_BASH) {
			if (a.pattern.test(command)) {
				if (!ctx.hasUI) {
					return { block: true, reason: `${a.label} blocked in headless mode (ask-tier requires interactive approval)` };
				}
				const choice = await ctx.ui.select(`⚠️ ${a.label}:\n\n  ${command}\n\nAllow?`, ["Yes", "No"]);
				if (choice !== "Yes") return { block: true, reason: `${a.label} declined by user` };
			}
		}
		return undefined;
	});
}
