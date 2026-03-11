# Labs Simplification Plan: Authoritative Delete, No Hidden Sandbox Repair, Project-Only IDE

## Summary

Simplify labs around one principle: a lab is just a project-bound sandbox attached to a chat thread, not a virtual computer.

This plan does four things:

1. Make thread deletion authoritatively delete the Daytona sandbox before the lab record is removed.
2. Remove lifecycle/features that create extra sandboxes or hide failures: `forceNewSandbox`, `archive_lab`, and PTY auto-replacement/migration.
3. Keep Daytona PTY as the terminal primitive, but fail fast on broken runtimes instead of silently creating new sandboxes.
4. Keep scope tight: no billing/plan-based caps yet, no background reconciliation job, no desktop/VM-style lab surface.

Answer to the terminal question: yes, Daytona can support a real terminal via PTY. The current issue is not that PTY is impossible, it is that the lifecycle around sandboxes became too magical and too leaky. This plan keeps PTY and removes the magic.

## Product Decisions Locked

- Thread deletion is the only supported “close lab” lifecycle in this pass.
- Sandbox deletion on thread delete is blocking and authoritative.
- No global “2 active labs” cap yet. Billing/plan enforcement is deferred.
- No ongoing orphan reconciliation job.
- PTY runtime failures should be shown clearly to the user; no automatic replacement sandbox creation.
- The learner experience remains: files, editor, PTY terminal, preview. No virtual computer / desktop framing.

## Goals

- Deleting a thread deletes its Daytona sandbox or fails visibly without deleting the thread.
- Creating or reusing a lab never creates extra hidden sandboxes.
- PTY failures do not create replacement sandboxes.
- The lab experience stays scoped to one project rooted in `/workspace`.
- The codebase removes lab lifecycle branches that are not actually part of the product.

## Non-Goals

- Billing-based quotas or “max 2 active labs” enforcement.
- Auto-healing/orphan reconciliation jobs.
- Full live-preview websocket/HMR rewrite.
- VM/desktop/SSH-like learner-facing lab experiences.
- Cross-thread sandbox sharing.

## Scope Changes

### 1. Make Sandbox Deletion Authoritative

#### Current problem
`deleteThread` tries `deleteSandbox`, but if Daytona deletion fails, it still deletes the `labSessions` record. That leaves orphaned sandboxes in Daytona.

#### Planned behavior
When deleting a thread with a lab:
- call Daytona sandbox delete first
- treat Daytona `404/not_found` as success
- if delete fails for any other reason, abort thread deletion
- keep the thread and `labSessions` row intact
- surface a typed error back to the UI so the user can retry

#### Implementation changes
- Add a new internal helper in [convex/daytona.ts](/C:/Users/kaust/Documents/coding/studi/convex/daytona.ts):
  - `deleteSandboxAndConfirm(sandboxId: string): Promise<void>`
- Behavior:
  - call delete
  - if result is success, optionally confirm via one short retry/backoff read until sandbox is gone or timeout
  - if Daytona says not found, return success
  - otherwise throw normalized Daytona error

- Change [convex/chatActions.ts](/C:/Users/kaust/Documents/coding/studi/convex/chatActions.ts):
  - `deleteThread` must delete the sandbox first
  - only after successful sandbox removal may it delete:
    - `labSessions`
    - agent thread/messages
    - `userThreads` row

#### Public API change
Change `api.chatActions.deleteThread` from the current “always returns deleted + optional warning” shape to a typed result union:

- success:
  - `status: "success"`
  - `deleted: true`
  - `deletedLab: boolean`
- failure:
  - `status: "failed"`
  - `summary: string`
  - `error: DaytonaToolError`

#### UI behavior
In [components/StudiChat.tsx](/C:/Users/kaust/Documents/coding/studi/components/StudiChat.tsx):
- if thread delete fails, do not clear the thread locally
- show a clear error toast/banner/modal message
- allow retry

## 2. Remove `forceNewSandbox`

#### Current problem
`forceNewSandbox` exists because lifecycle is unreliable. It also creates another orphan path when old-sandbox cleanup fails.

#### Planned behavior
Remove `forceNewSandbox` from the learner/agent lab surface entirely.

If a sandbox is broken:
- the terminal shows a clear error
- the user deletes the thread and recreates a new lab thread if needed
- no hidden “make a fresh sandbox” branch in normal product flow

#### Implementation changes
- Remove `forceNewSandbox` from [convex/labTools.ts](/C:/Users/kaust/Documents/coding/studi/convex/labTools.ts):
  - delete it from `createLabSchema`
  - delete logic that conditionally deletes and recreates a sandbox
- Update prompt/tool instructions so the agent no longer mentions or relies on `forceNewSandbox`
- Remove any references in generated prompts and lab agent instructions

#### Public API change
`create_lab` tool args lose:
- `forceNewSandbox?: boolean`

#### Resulting lifecycle
Per thread:
- if a `labSession` exists, reuse its sandbox
- if not, create one sandbox
- sandbox replacement is never implicit

## 3. Remove Hidden Archive Lifecycle

#### Current problem
The product does not actually expose archive to the user, but the backend still has `archive_lab` and `archivedAt` branching. This adds complexity and confused lifecycle semantics.

#### Planned behavior
For this pass, labs support only:
- active lab attached to thread
- thread deleted => lab deleted

Archive is not a supported product lifecycle.

#### Implementation changes
- Remove `archive_lab` from [convex/agent.ts](/C:/Users/kaust/Documents/coding/studi/convex/agent.ts) toolsets
- Remove or retire [convex/labTools.ts](/C:/Users/kaust/Documents/coding/studi/convex/labTools.ts) `archiveLabTool`
- Stop treating `archivedAt` as a meaningful product state in active code paths
- Keep `archivedAt` in schema for compatibility only in this pass; do not write new archive state

#### Compatibility rule
Existing `labSessions.archivedAt` rows are treated as legacy.
For active path resolution:
- if a `labSession` exists for the thread, it is resumable
- `ensureSandboxStarted` handles starting stopped sandboxes
- do not add new archive UI or archive-resume logic

#### Query behavior update
In [convex/labIde.ts](/C:/Users/kaust/Documents/coding/studi/convex/labIde.ts) and any lab-access helpers:
- stop throwing just because `archivedAt` is present
- the only hard blocker is “no lab session exists”

## 4. Remove PTY Auto-Replacement and Workspace Migration

#### Current problem
When PTY bootstrap hits the broken-shell issue, the code creates a replacement sandbox, migrates `/workspace`, updates `labSessions`, and leaves the old sandbox behind. This is both surprising and leaky.

#### Planned behavior
PTY bootstrap must fail fast and visibly.
No new sandbox is created automatically from terminal code.

#### Implementation changes
Remove from [convex/labIde.ts](/C:/Users/kaust/Documents/coding/studi/convex/labIde.ts):
- `replaceBrokenPtySandbox`
- any call path that auto-creates replacement sandboxes after PTY failure

Remove from [lib/daytona/server.ts](/C:/Users/kaust/Documents/coding/studi/lib/daytona/server.ts):
- `migrateWorkspaceToReplacementSandbox`
- replacement-sandbox migration code
- related repair labels like `repaired_from_sandbox`, `repair_reason` from this flow

Keep:
- detailed PTY diagnostics
- default sandbox user = `root` for new sandboxes
- clear terminal failure messaging

#### User-facing PTY error behavior
If PTY bootstrap fails due invalid shell/runtime:
- terminal status becomes disconnected
- error banner explains the sandbox runtime is invalid
- suggested next step is explicit:
  - “Delete this thread and recreate the lab”
- no hidden recovery, no silent sandbox creation

## 5. Keep PTY, But Simplify the Terminal Responsibility

#### Product stance
A real terminal is still the right product for this IDE. Daytona PTY is the correct primitive.

#### Scope for this pass
Do not do a broad “virtual computer” expansion.
Do not add desktop-like tooling.
Do not add more PTY healing logic.

#### Terminal architecture changes in this pass
Keep the current PTY-backed terminal surface, but simplify and harden it:

- `ensureLabPtySession` only ensures/reuses `studi-main`
- it never creates a replacement sandbox
- stream/connect path should not invoke extra sandbox-creation logic beyond ensuring the PTY exists
- error handling must preserve Daytona diagnostics and show them cleanly in the UI
- keep `Ctrl+C`, resize, and output streaming

#### Explicit defer
A deeper PTY transport redesign is deferred unless lifecycle cleanup still leaves the terminal unacceptable.
That means this plan does not include:
- websocket relay sidecar
- multi-terminal tabs
- terminal session persistence beyond normal PTY reuse
- command-runner fallback mode

This is intentional to avoid feature creep.

## 6. Remove Virtual-Computer Concepts From the Lab Surface

#### Product rule
The learner should see:
- project files
- editor
- terminal
- preview

They should not be nudged toward thinking this is a whole remote desktop/computer.

#### Implementation changes
Remove or retire any learner-facing lab APIs/features that imply a full remote machine when unused:
- [convex/labIde.ts](/C:/Users/kaust/Documents/coding/studi/convex/labIde.ts) `getLabTerminalLink`
- any UI entrypoints that link to separate terminal/desktop-style experiences
- any copy that implies VM/computer rather than project IDE

Keep:
- workspace rooted at `/workspace`
- preview ports 3000–9999
- project-only file navigation

## 7. Do Not Add Reconciliation Job

#### Decision
No periodic orphan cleanup job in this pass.

#### Reason
- user already manually cleaned current drift
- the right fix is to stop creating drift
- a reconciler would add moving parts before the core lifecycle is trustworthy

#### What we will do instead
- keep Daytona labels (`app=studi`, `scope=lab`) for manual auditability
- improve delete/create failure logging
- remove the code paths that currently create orphaned sandboxes

## 8. No Billing/Quota Logic Yet

#### Decision
Do not implement “max 2 active labs” enforcement in this pass.

#### Reason
The user explicitly wants billing/plan enforcement later.
A hard cap now would introduce product policy and UX that will likely be redone.

#### Current behavior after this pass
- no global active-lab limit
- one sandbox per thread
- no hidden extra sandboxes from repair/recreate branches

This gets actual sandbox count much closer to “number of active lab threads,” without prematurely adding plan/billing policy.

## File-Level Plan

### Backend lifecycle
Update:
- [convex/chatActions.ts](/C:/Users/kaust/Documents/coding/studi/convex/chatActions.ts)
- [convex/labTools.ts](/C:/Users/kaust/Documents/coding/studi/convex/labTools.ts)
- [convex/labIde.ts](/C:/Users/kaust/Documents/coding/studi/convex/labIde.ts)
- [convex/daytona.ts](/C:/Users/kaust/Documents/coding/studi/convex/daytona.ts)
- [convex/labs.ts](/C:/Users/kaust/Documents/coding/studi/convex/labs.ts)
- [convex/agent.ts](/C:/Users/kaust/Documents/coding/studi/convex/agent.ts)

### Server PTY helpers
Update:
- [lib/daytona/server.ts](/C:/Users/kaust/Documents/coding/studi/lib/daytona/server.ts)

### Terminal / frontend
Update:
- [components/lab/LabPtyTerminal.tsx](/C:/Users/kaust/Documents/coding/studi/components/lab/LabPtyTerminal.tsx)
- [components/StudiChat.tsx](/C:/Users/kaust/Documents/coding/studi/components/StudiChat.tsx)

### Keep schema compatibility
Likely no schema removal in this pass.
Keep `archivedAt` field in:
- [convex/schema.ts](/C:/Users/kaust/Documents/coding/studi/convex/schema.ts)

but stop using it as a supported product lifecycle state.

## Public APIs / Interfaces / Types

### `api.chatActions.deleteThread`
Change return type to union:

- success:
  - `status: "success"`
  - `deleted: true`
  - `deletedLab: boolean`

- failure:
  - `status: "failed"`
  - `summary: string`
  - `error: DaytonaToolError`

### `create_lab` tool
Remove:
- `forceNewSandbox?: boolean`

Behavior becomes:
- reuse existing sandbox for the thread if present
- otherwise create exactly one sandbox

### Agent toolset
Remove:
- `archive_lab`

### Legacy compatibility
Keep `labSessions.archivedAt` in stored data for now, but no new product logic should depend on it.

## Failure Modes and Handling

### Daytona delete returns `404`
Treat as success.
Proceed with local lab/thread deletion.

### Daytona delete returns network/5xx/permission error
Do not delete the thread or `labSessions`.
Return typed failure to UI.

### PTY bootstrap hits broken shell/runtime
Do not create a new sandbox.
Return typed failure with clear message.
Suggested user action: delete thread and recreate lab.

### Existing legacy archived lab session
Treat as resumable if the row still exists.
Do not add new archive state.

### Existing orphaned sandboxes from old bugs
Out of scope for product automation in this pass.
Manual cleanup only.

## Test Cases and Scenarios

### Unit tests
Add or update tests for:

- `deleteSandboxAndConfirm`
  - delete success
  - delete returns not found
  - delete fails and propagates typed error

- `create_lab`
  - existing thread lab reuses sandbox
  - no `forceNewSandbox` path exists
  - no hidden second sandbox is created

- PTY session ensure
  - PTY success returns existing/created session
  - broken shell error returns failure
  - no replacement sandbox path is invoked

- thread delete flow
  - sandbox deleted first, then DB rows removed
  - delete failure keeps DB rows intact

### Integration/component tests
Add or update tests for:

- deleting a thread with a lab:
  - success path clears UI thread
  - failure path leaves thread and shows error

- lab agent/tool availability:
  - `archive_lab` is no longer available
  - `forceNewSandbox` is no longer in `create_lab` args

- terminal failure UI:
  - PTY bootstrap error shows banner
  - no “repairing/recreating sandbox” behavior appears

### Manual smoke tests
1. Create a new lab thread.
2. Confirm exactly one Daytona sandbox is created.
3. Reload thread and confirm same sandbox is reused.
4. Delete the thread and confirm the sandbox disappears from Daytona.
5. Simulate Daytona delete failure and confirm thread is not deleted.
6. Open a sandbox with a broken PTY runtime and confirm terminal shows a clear error without creating another sandbox.
7. Create a normal PTY lab and confirm typing, `Ctrl+C`, and resize still work.
8. Start a dev server and confirm preview still opens through the existing proxy.

## Acceptance Criteria

- Deleting a thread with a lab deletes the Daytona sandbox first or fails visibly without deleting the thread.
- No code path in normal product flow silently creates a second sandbox for the same thread.
- `forceNewSandbox` is gone from the lab creation surface.
- `archive_lab` is gone from the supported tool surface.
- PTY failure does not create a replacement sandbox.
- New sandboxes still default to a valid shell user (`root` unless overridden).
- The learner-facing lab remains a project IDE, not a virtual computer.
- No reconciliation job is added.
- No billing/2-lab cap logic is added in this pass.

## Assumptions and Defaults

- “Main thread deleted” means the chat thread is deleted through the existing thread delete action/UI.
- New sandbox default user remains `root`, with `DAYTONA_SANDBOX_USER` override still allowed.
- Existing archived lab rows may remain in the database temporarily; they are treated as legacy compatibility state, not an actively supported lifecycle.
- Billing-based limits and active-lab caps are explicitly deferred.
- Preview/HMR improvements are deferred unless lifecycle cleanup still leaves labs unusable.
- This pass favors simpler, explicit failure over hidden recovery logic.
