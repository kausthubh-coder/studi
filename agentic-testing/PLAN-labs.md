# Lab Testing Plan

## Goals

- Verify lab activation works on real deployment (`create_lab`).
- Verify the assistant performs concrete sandbox actions (`run`, `glob`, `read`, `write`) after activation.
- Capture detailed tool-level failures so retries can be reasoned by the model.
- Validate split chat + IDE UX behavior manually in the frontend.

## Runtime Checks

1. Playground API exposes both agents: `studi`, `codi`.
2. `agentic-testing` can run assertions with:
   - `--expectTools`
   - `--failOnToolError`
3. Tool results include structured diagnostics in artifacts.

## Suites

- `agentic-testing/suites/lab-smoke.json`
  - core flow: create lab, run command, glob files
- `agentic-testing/suites/lab-react-demo.json`
  - educational flow with scaffold + follow-up edits

## Manual UI Verification

1. Ask: "I want to learn react".
2. Confirm tool call `create_lab` succeeds.
3. Confirm layout switches to split view:
   - left: thread
   - right: IDE (files + editor + terminal)
4. Confirm terminal command execution works and output is visible.
5. Confirm opening/saving files works.

## Pass Criteria

- No auth/permission tool failures in smoke suite.
- Required tools are called.
- CLI exits non-zero on failed assertions.
- UI split layout appears when active lab session exists.
