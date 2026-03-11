# CodeSandbox Cutover Plan

## Summary

Replace Daytona completely with CodeSandbox SDK for lab creation, filesystem, commands, browser sessions, terminal transport, previews, and sandbox lifecycle. Keep the current thread-owned lab model and current agent tool names (`create_lab`, `list`, `read`, `grep`, `glob`, `run`, `edit`, `write`) so the tutoring behavior does not change. Use one private universal CodeSandbox template to support web stacks, Python, Rust, C, and C++, and bulk-reset all existing Daytona-backed lab sessions at deploy.

## Current Baseline Findings

- `bun run build` passes on the current codebase.
- Browser smoke on `http://localhost:3000/` succeeds, but local dev logs a Clerk infinite redirect loop warning, so authenticated browser E2E will require valid Clerk keys before final validation.
- `bun run lint` currently fails on pre-existing `react/no-unescaped-entities` issues in landing-page files; the migration branch should leave lint green.
- Raw `bun test` is noisy because it sweeps example workspaces; `bun run test` is also currently broken on Windows because the quoted glob filters do not match any files. The migration branch should fix the project test command so it is actually usable.
- Agent CLI smoke could not be run from the shell because `CONVEX_URL` and `STUDI_PLAYGROUND_API_KEY` are not present in the shell environment.

## Locked Decisions

- `Runtime scope`: initial v1 must support web frameworks broadly (`React`, `Next.js`, `Svelte`/`SvelteKit`, Vite-style apps), plus `Python`, `Rust`, `C`, and `C++`.
- `Terminal UX`: keep the current terminal look-and-feel with `xterm`, but remove the custom Daytona PTY transport and use CodeSandbox browser sessions directly.
- `Cutover`: bulk-reset all legacy Daytona `labSessions` at deploy; do not keep a dual-provider compatibility path.
- `Provider model`: use CodeSandbox SDK in app/runtime code; do not shell out to the `csb` CLI from production code. The CLI is only for operator/template workflows if needed.
- `Template strategy`: start with one private “studi universal” CodeSandbox template rather than many per-framework templates. Framework apps are scaffolded inside the sandbox with commands.

## Implementation Plan

- `Dependencies and config`: add `@codesandbox/sdk`; remove `@daytonaio/sdk`; add `CSB_API_KEY`, `CSB_TEMPLATE_UNIVERSAL_ID`, and `CSB_HIBERNATION_TIMEOUT_SECONDS` to local env docs and Convex env docs; remove all `DAYTONA_*` env references.
- `Template provisioning`: create one CodeSandbox template sandbox owned by your workspace, marked `private`, with Bun, Node 22, Python 3.12, `uv`/`pip`, Rust toolchain, `clang`/`g++`, `cmake`, `git`, and `ripgrep` installed. This template is the source for every Studi lab.
- `Provider wrapper`: replace the Daytona helpers with one CodeSandbox wrapper module under Convex Node runtime. It must expose `createSandbox`, `resumeSandbox`, `deleteSandboxAndConfirm`, `createBrowserSession`, `createHostToken`, `listFiles`, `readFile`, `writeFile`, `editFile`, `grepFiles`, `globFiles`, `runCommand`, `waitForPort`, and `classifyLabRuntimeError`.
- `Path model`: stop hardcoding `workspace`. Use the CodeSandbox `workspacePath` returned by the SDK and store it in lab session metadata. All file and command helpers must normalize paths relative to stored `workspacePath` and reject traversal outside it.
- `Search implementation`: implement `grep` with `rg -n --no-heading --hidden` and `glob` with `rg --files -g <pattern>` inside the sandbox. The universal template must guarantee `rg` is installed.
- `Sandbox privacy`: every lab sandbox is created as `private` with tags for `app=studi`, `scope=lab`, and `runtimeProfileId`. Browser preview access uses short-lived host tokens created server-side and attached to browser sessions.
- `Browser session model`: add one new public Convex action, `createLabClientSession`, that returns the serializable CodeSandbox `SandboxSession` needed by `connectToSandbox(...)`. It accepts `threadId` and optional `sessionId`, enforces thread ownership, resumes the sandbox if needed, creates a short-lived host token, and creates/resumes a browser session with `permission: "write"`.
- `Lab tools`: keep the current tool names and arguments unchanged. `create_lab` must now create or resume a CodeSandbox sandbox from the universal template, persist `workspacePath` and `templateKey`, and return those values in its metadata. The agent-facing tool surface stays stable.
- `IDE actions`: keep `listLabFiles`, `readLabFile`, `writeLabFile`, `editLabFile`, `runLabCommand`, `grepLabFiles`, and `globLabFiles`. Remove the Daytona PTY action family and remove the preview proxy descriptor action. Add `createLabClientSession`.
- `Thread deletion`: replace Daytona delete logic with CodeSandbox delete logic and keep the same authoritative behavior: delete the sandbox first, treat not-found as success, only then remove the `labSessions` row.
- `Legacy reset`: add a one-off migration path that bulk-deletes all existing `labSessions` during rollout. Do not try to translate old Daytona sandbox IDs into CodeSandbox sandboxes.
- `Frontend terminal`: replace the current transport in the lab terminal component with a browser-side CodeSandbox client created via `connectToSandbox`. Keep `xterm` for rendering, but wire input/output directly to `sandbox.terminals.create/get/open/write/run/kill` instead of the `/api/lab/pty/*` routes.
- `Frontend preview`: stop parsing terminal output for preview detection. Subscribe to `sandbox.ports.onDidPortOpen` and `sandbox.ports.onDidPortClose` from the browser client. Build preview URLs with `sandbox.hosts.getUrl(port)` and use those URLs directly in the iframe.
- `Frontend state`: stop persisting terminal session IDs in local storage. Persist only current file path, selected file, active tab, and active preview port. The browser sandbox session should be recreated via `createLabClientSession` on reload and reconnect.
- `Server routes cleanup`: delete the PTY routes and the preview proxy route entirely. After migration there should be no lab-specific Next.js transport routes.
- `Schema`: keep `labSessions.sandboxId`, add `workspacePath` and `templateKey` to `labSessions.metadata`, and keep `archivedAt` untouched only if already present; no new logic should depend on it.
- `Error model`: replace `DaytonaToolError` with a generic `LabRuntimeError` and update validators and UI messaging accordingly.
- `Prompt and docs cleanup`: remove all “Daytona sandbox” wording from the coding agent prompt, README, AGENTS/CLAUDE docs, and user-facing lab copy. Run prompt generation sync after updating the prompt source.
- `Validation script cleanup`: fix the project test script so it works cross-platform on Windows and does not silently match zero files. Keep example workspaces out of the project validation path.

## Public API / Interface Changes

- `New action`: `createLabClientSession({ threadId, sessionId? }) -> SandboxSession`.
- `Removed actions`: `ensureLabPtySession`, `runLabTerminalCommand`, `getLabTerminalCommandLogs`, `sendLabTerminalInput`, `closeLabTerminalSession`, and `getLabPreviewProxyDescriptor`.
- `Unchanged tool contracts`: `create_lab`, `list`, `read`, `grep`, `glob`, `run`, `edit`, and `write` keep their names and input shapes.
- `Schema change`: `labSessions.metadata` gains `workspacePath?: string` and `templateKey?: string`.
- `Error contract`: every lab action/tool returns `LabRuntimeError` instead of `DaytonaToolError`.
- `Runtime env`: add `CSB_API_KEY`, `CSB_TEMPLATE_UNIVERSAL_ID`, and optional `CSB_HIBERNATION_TIMEOUT_SECONDS`; remove all `DAYTONA_*` runtime requirements.

## Files / Modules to Touch

- Replace the Convex provider helper module and delete the Daytona helper module.
- Replace the server-side Daytona PTY helper module and delete the entire Daytona-specific library folder.
- Update the lab tool module, lab IDE action module, thread deletion action module, schema module, and lab session module.
- Replace the lab terminal transport implementation and simplify the workspace component’s preview logic.
- Delete the lab PTY API routes and preview proxy route.
- Update the coding-agent prompt source and regenerate prompt artifacts.
- Update README, AGENTS/CLAUDE docs, package manifest, and lockfile.
- Add a small migration script or admin mutation for the bulk legacy lab-session reset.

## Test and Verification Plan

- `Unit`: provider helper tests for path normalization, error normalization, file truncation/binary handling, grep parsing, glob parsing, delete confirmation, and sandbox/session creation behavior.
- `Component`: lab client hook tests for session creation, reconnect, port-open events, and terminal lifecycle cleanup.
- `Regression`: rename preview helper tests from Daytona-specific wording and keep preview port filtering only if still used for UI policy.
- `Build`: `bun run build` must pass.
- `Lint`: `bun run lint` must pass; fix current unrelated landing-page lint failures on the migration branch so CI is trustworthy.
- `Tests`: `bun run test` must be repaired and must pass for project-owned tests only.
- `Agent CLI`: once `CONVEX_URL` and `STUDI_PLAYGROUND_API_KEY` are set in the shell, run the existing lab smoke suite and confirm `create_lab`, `run`, and `glob` succeed against CodeSandbox.
- `Browser smoke`: use Playwright CLI against local dev with valid Clerk keys to verify unauthenticated load, sign-in, create lab, interactive terminal input/output, file open/save, automatic preview prompt from port events, preview iframe load, and thread deletion cleanup.

## Rollout Sequence

1. Provision the private universal CodeSandbox template and record its sandbox ID.
2. Add CodeSandbox env vars to local env and Convex env.
3. Merge the provider swap, frontend transport swap, schema additions, prompt/docs cleanup, and validation-script fix in one cutover branch.
4. Deploy backend and frontend together.
5. Immediately run the bulk-reset migration for all legacy `labSessions`.
6. Run `build`, `lint`, repaired `test`, agentic lab smoke, and browser smoke.
7. Confirm there are zero remaining Daytona imports, zero `DAYTONA_*` env references, and no lab transport routes left in the app.

## Acceptance Criteria

- No Daytona code, env vars, docs, prompts, or routes remain in the repo.
- New labs start in CodeSandbox and stay tied to the same thread model.
- The terminal works interactively in-browser without any Next.js PTY relay.
- Preview opens from CodeSandbox port events and loads directly without a proxy route.
- File operations, grep/glob, and commands work from both the agent tools and the IDE.
- Deleting a thread deletes its CodeSandbox sandbox first or fails visibly without deleting the thread.
- All legacy Daytona lab sessions are invalidated during rollout.
- `build`, `lint`, repaired `test`, agentic smoke, and browser smoke all pass in the migration branch.

## Assumptions and Defaults

- The provided CodeSandbox API token will be configured only as `CSB_API_KEY`; it must not be committed or echoed back into source.
- A single universal template is sufficient for the initial runtime scope; optimize into multiple templates only after usage data proves it is necessary.
- Sandboxes remain private and preview access is mediated by short-lived host tokens attached to browser sessions.
- Existing lab thread content is preserved, but existing Daytona lab environments are intentionally discarded at deploy.
- The terminal UI can stay visually similar with `xterm`; the “native CodeSandbox terminal” requirement is satisfied by replacing the transport/session layer, not by introducing an opaque third-party widget.

## References

- https://codesandbox.io/docs/sdk/setup
- https://codesandbox.io/docs/sdk/create
- https://codesandbox.io/docs/sdk/clients
- https://codesandbox.io/docs/sdk/terminals
- https://codesandbox.io/docs/sdk/filesystem
- https://codesandbox.io/docs/sdk/commands
- https://codesandbox.io/docs/sdk/ports
- https://codesandbox.io/docs/sdk/browser-previews
- https://codesandbox.io/docs/sdk/preview-api-access
- https://codesandbox.io/docs/sdk/manage-sandboxes
- https://codesandbox.io/docs/sdk/tracing
- https://codesandbox.io/docs/sdk/cli
- https://www.npmjs.com/package/@codesandbox/sdk
