# Manual verification script (MV-001 to MV-005)

These checks need people. Record each session on the sheet at the end. Run them on the latest Chrome and the latest Edge, on a mid-range laptop, against the production build (`npm run build && npm run preview`).

## Participants

At least 5 business analysts or product owners who do not know PlantUML. None may see the source view first, and none may be coached. One facilitator observes and times; the facilitator answers only "I can't tell you, please try".

## Tasks (SC-001)

- **Task 1.** Build the reference login form: a "Sign in" group box containing a form with "Username" and "Password" text fields, a "Remember me" checkbox, and a button bar with "Sign in" and "Cancel".
- **Task 2.** Create a three-screen project with a screen flow containing one decision, and download it.

## MV-001: usability (SC-001, FR-008, FR-001)

Participants do both tasks without writing source. Start timing at the first click and stop when the downloaded file exists.

**Pass:** at least 4 of 5 complete both tasks unaided within 15 minutes.

## MV-002: hierarchy comprehension (SC-002, FR-002)

In the same sessions, once Task 1 is done, select the "Remember me" checkbox and ask: "Which container does this field belong to?" Then ask the participant to select that container.

**Pass:** at least 4 of 5 answer correctly and select it without help.

## MV-003: keyboard and screen reader (SC-003, FR-009)

Complete both tasks using only a keyboard. Repeat with a screen reader in focus mode on each supported browser (NVDA with Chrome or Edge on Windows, VoiceOver with Chrome on macOS if available).

**Pass:** both tasks complete, every element is announced meaningfully (type, text, cell, container), and the canvas key model works in focus mode.

## MV-004: wording and clarity (FR-008, FR-003)

Review the palette, properties panel, statuses and messages against the terminology table in the spec. Read each palette description for the limit of any construct Salt cannot draw fully.

**Pass:** terms match the table, no property needs Salt knowledge, each limited construct's description states its limit, and selection, insertion and focus states are clearly visible.

## MV-005: look and touch (FR-016, FR-009)

Inspect the screen canvas, the flow canvas and the source view. Then use a touchscreen device (or a laptop touchscreen).

**Pass:** the canvas looks like a Salt wireframe with no free positioning, limited constructs look as Salt draws them, source is highlighted, and touch uses taps and visible commands only.

## Recording sheet

| Session | Participant (role) | Browser / device | Assistive tech | MV | Task 1 time | Task 2 time | Unaided (Y/N) | Container answer correct (Y/N) | Pass (Y/N) | Notes |
| ------- | ------------------ | ---------------- | -------------- | -- | ----------- | ----------- | ------------- | ------------------------------ | ---------- | ----- |
| 1 | | | | | | | | | | |
| 2 | | | | | | | | | | |
| 3 | | | | | | | | | | |
| 4 | | | | | | | | | | |
| 5 | | | | | | | | | | |

Outcome: MV-001 __ / 5, MV-002 __ / 5, MV-003 pass/fail per browser, MV-004 pass/fail, MV-005 pass/fail. File defects against the task that owns the failing behaviour.
