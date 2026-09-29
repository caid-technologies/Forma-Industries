# Form Handoff Contract

Mergence accepts compiled Form project artifacts produced by the Form SDK, OpenCode, or Codex. Authoring and compilation remain outside Mergence; Mergence imports the accepted artifact for spatial review and layout.

## Supported Artifact

The preferred file is a `form-project.json` manifest containing a compiled `project_ir`:

```json
{
  "format": "form-project",
  "version": 1,
  "project_id": "project-id",
  "project_ir": {
    "hardware_ir_version": "0.2",
    "overview": { "title": "Example project" },
    "mechanical": {},
    "components": [],
    "part_definitions": []
  },
  "agent": "opencode",
  "artifacts": [{ "path": "models/enclosure.step", "sha256": "..." }]
}
```

The importer also accepts these existing Form representations:

- A top-level `hardware_ir` object.
- A top-level `project_ir` object.
- A `form.project` namespace object containing `project.meta`, `product.overview`, `product.electrical`, and `product.mech` payloads.

Compiled IR is preferred over a draft IR. The compiled project is the source of truth for validation, component identity, mechanical placements, and CAD references.

## Provenance

When present, the manifest should include:

- `project_id`: stable Form project identity.
- `revision`: source revision or namespace object revision.
- `agent`: one of `sdk`, `opencode`, or `codex`.
- `hardware_ir_version`: supported Hardware IR version (`0.1` or `0.2`).
- `validation`: compiler validation summary and findings.
- `artifacts`: local artifact paths and optional SHA-256 digests.

Provider credentials, MCP tokens, API keys, prompts containing secrets, and server logs must not be written to the artifact.

## CAD Resolution

Mergence resolves CAD only from files explicitly selected with the project JSON. A CAD reference may be a path, filename, or nested CAD source object. The importer matches normalized paths or filenames and verifies an `artifacts[].sha256` value when supplied.

Remote URLs and server-local paths are metadata only and are not fetched automatically. Missing CAD may fall back to `mechanical.component_placements` or `mechanical.render_dimensions` envelopes when those fields are available.

Form mechanical placement coordinates are millimeters with Z-up. Mergence normalizes imported geometry to meters with Y-up and keeps the normalization offset in the scene asset metadata.

## Agent Workflows

The SDK, OpenCode, and Codex workflows converge on the same compiled artifact:

```text
SDK or agent authors Hardware IR
  -> form.compile_project
  -> form-project.json with compiled project_ir
  -> Mergence imports JSON and selected CAD artifacts
  -> Mergence reviews and arranges the project spatially
```

OpenCode and Codex should use the `form-hardware` skill and set the authoring agent explicitly when compiling:

```bash
python .agents/skills/form-hardware/scripts/form.py compile \
  "$PROJECT_DIR/form-project.json" \
  --authoring-agent opencode \
  --output "$PROJECT_DIR/compiled-project.json" \
  --update-project
```

Use `--authoring-agent codex` for Codex-authored projects. The resulting manifest, not the pre-compiled draft, is the file to import into Mergence.

## Ownership Boundary

Form owns the authored Hardware IR, electrical validation, component identity, and compiled project revision. Mergence owns room placement, camera context, visibility, and spatial review state. Mergence spatial edits are not electrically revalidated by Form unless a later explicit handoff workflow is used. Authored animation reviews are handed back as a scrubbed `astra.animation-feedback` package; OpenCode applies accepted mechanical changes through Form's `form.opencode.update_project` tool before Mergence reimports the revised artifact.

## Compatibility

Unsupported versions and malformed variants must fail with an actionable message. Mergence must retain local file import when Form MCP is unavailable. Direct MCP integration is optional and must remain server-side; credentials must never enter the browser bundle or saved scene files.
