# CodeSandbox Templates

This directory stores the local source for Studi's CodeSandbox lab templates.

Scripts:

- `bun run csb:templates:sync`: sync the allowlisted templates from `codesandbox/sandbox-templates`
- `bun run csb:templates:build`: build every synced template with the CodeSandbox CLI
- `bun run csb:templates:build -- --template=react_vite,nextjs`: build a subset

The app ships with official CodeSandbox template IDs as defaults. Build and publish local copies only when you want private/custom replacements, then set the matching `CSB_TEMPLATE_*` Convex env var as an override.

Publishing flow:

1. Run `bun run csb:templates:sync`
2. Export `CSB_API_KEY` in your local shell
3. Run `bun run csb:templates:build`
4. Copy each returned sandbox ID into the matching Convex env var
5. Restart `convex dev`

The canonical key-to-env-var mapping is in `codesandbox/templates/manifest.json`.
