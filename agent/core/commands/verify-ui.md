Detect the running dev server port (check terminal output or try 3000/3001/5173). Run:
`node ~/harness/agent/modules/web-development/verify-ui.mjs http://localhost:<port>`
Then READ both PNGs with the Read tool and report: what the page actually looks like at 1440 and 390, every console error, every failed request. If anything is wrong, fix and re-run before claiming done. $ARGUMENTS may override the URL.
