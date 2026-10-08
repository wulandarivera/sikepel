# Portal Mandiri QA fixes

Task: t_9a4a9b8c. Branch: fix/mandiri-qa-accessibility. Base: 81f1045 (fast-forwarded from main; initial cherry-pick onto old main aborted without residual changes).

Changes:
- Ticket helper now TIK-YYYYMM-XXXXXXXX; validation still requires eight hexadecimal suffix characters.
- Timeline retains numbered steps and aria-current; completed steps announce `tahap selesai`, no decorative check glyph.
- Separate control border #64748b (4.76:1 against white, 4.55:1 against #f8fafc), hover #475569, focus #1e3a8a. Decorative panel borders unchanged. Secondary buttons use accessible control borders.
- Explicit input/select/textarea focus-visible selectors prevent their outline:none focus rule overriding the keyboard outline.

Execution on Node 22.23.3:
- RED: two new design regressions failed before fixes.
- GREEN: targeted design/UI/no-emoji tests 9/9 passed.
- npm run typecheck passed; npm run build passed (Next 16.3.6).
- Isolated production browser fixture 15/15 passed; pageErrors empty. Temporary fixture database removed, fixture server stopped. Production service/data untouched.
- Home, identity, letter type, confirmation, attachments, tracking revision: 320/360/390/768/1440px no horizontal overflow. CSS zoom 200% at 640px plus 320px equivalent reflow passed each state. These are automation reflow checks, not browser-chrome native zoom.
- Computed default/hover/focus borders of text/date/file/password inputs, select, textarea and secondary buttons passed 3:1. Tracking keyboard Tab advances ticket to token to submit; token outline computed 3px. Skip link passed.
- Browser verifies four-character suffix invalid, eight-character suffix valid; helper, completed timeline text, one aria-current step.
- Full suite 57/67 passed; 10 failures (parent plus 9 subtests) remain PDF converter 503/dependent acceptance cases, matching upstream blocker. Log: /home/cibodas/.hermes/profiles/sikepel-frontend/cache/scratch/t_9a4a9b8c-full-test.log.
- git diff --check passed.

Browser report: reference/verification/mandiri-frontend-browser.json (ignored runtime evidence). Screenshots: reference/verification/portal-redesign/ (ignored; receipt token/ticket masked). No deploy/restart; security upgrade remains separate t_2710767d.
