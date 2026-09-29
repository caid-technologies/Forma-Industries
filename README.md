# Astra Industries

**Arrange hardware in a 3D space, animate how it moves, and share the layout for review.**

Astra Industries is a spatial workbench that runs locally in your browser for planning fabrication shops, manufacturing spaces, and laboratories. Import equipment from [Forma OSS](https://github.com/caid-technologies/Forma-OSS) or a STEP CAD file, place it in a room at real-world scale, and preview a workflow before moving physical equipment.

This is a hackathon project by CAID Technologies. **Forma-Industries is the repository name; Astra Industries is the application name.**

[Run locally](#run-locally) · [Try the local demo](#try-the-local-demo) · [Documentation](#documentation)

## Why use it?

A hardware model describes an individual piece of equipment. Planning a workspace also means deciding where that equipment goes, what sits around it, and how people or materials move through the room.

Astra brings those models into one editable scene. A maker can compare workbench arrangements, a manufacturing team can illustrate material flow, and a lab team can review an equipment layout or sampling route. The output is a room layout, an animation, and files that others can reopen or review.

## Try the local demo

Follow [Run locally](#run-locally) to install the project and start `npm run dev`, then open the [cleanroom demo](http://127.0.0.1:5173/?scene=cleanroom). It includes four rooms, stainless workbenches, and a Forma-authored swab-sampling robot. The animation visits Rooms A and C and skips occupied Room B, showing how equipment, space, and a schedule fit together. The demo opens without replacing your saved workspace.

To make your own layout, open the [local workbench](http://127.0.0.1:5173):

1. Choose **Space brief / local demo**, select a maker, manufacturing, or biofab space, and click **Build space layout**. This creates a preset layout with labeled equipment placeholders and a material-flow animation.
2. Or choose **Import project** / **Drop files or browse** to open your own Forma JSON, STEP model, or saved Astra scene.
3. Adjust the room and equipment, then use **Animate**, **GIF studio**, or **Export scene JSON** to inspect and share the result.

You can import, edit, animate, and export locally without signing in. Optional cloud features use GitHub sign-in and a configured Supabase backend; the workbench itself runs on your machine.

## What you can do today

| Capability | What it does |
| --- | --- |
| Import equipment | Open Forma project JSON and `.step` / `.stp` CAD files, with geometry normalized to meters. |
| Arrange a room | Set width, depth, and height; move, rotate, rename, duplicate, hide, or remove equipment instances; undo and redo edits. |
| Inspect a design | View available components, bill of materials (BOM), validation findings, and source/project metadata. |
| Author motion | Add position and rotation keyframes for equipment or components, then play or scrub the timeline. |
| Export a visual review | Render GIFs of a room, a floor section, or a selected asset, with companion JSON recording spatial and animation context. |
| Reuse equipment | Save geometry and previews in a device asset library and add them to another layout. |
| Save and reopen | Export portable scene JSON, restore local drafts, or explicitly save named cloud scenes after signing in. |
| Work with agents locally | Use optional Forma/OpenCode/MCP workflows to create equipment, create rooms, and hand animation feedback back to Forma. |

## How Forma and Astra work together

**Forma authors the equipment; Astra places and reviews it in a space.** Forma OSS provides hardware generation, validation, and compiled project data. Astra imports that output and adds room layout, instance placement, animation, and visual review.

1. **Create or bring equipment.** Author and compile a project in Forma, or use an existing STEP file from another CAD tool.
2. **Import it into Astra.** Select the Forma JSON and any referenced STEP files together. Standalone STEP files also work.
3. **Arrange and animate.** Place equipment in the room and add keyframes to illustrate its motion or a workflow.
4. **Save or share.** Export a portable scene, render a GIF plus review metadata, or save a cloud scene.
5. **Iterate when needed.** In the optional local agent workflow, send animation feedback to Forma, review the revised design, and reimport its compiled artifact.

An **asset** is reusable imported equipment geometry. An **instance** is one placed copy of that asset. A **scene** combines the room, instances, and animation. Multiple instances can share one asset while keeping independent positions and motion.

See the [workspace guide](docs/workspace.md) for the full editing workflow and the [Forma handoff contract](docs/forma-handoff.md) for supported project formats.

## Saving your work

| Option | Where it lives | Best for |
| --- | --- | --- |
| Automatic local draft | The current browser/device | Returning to work after a refresh. This is separate from a cloud save. |
| Device asset library | The current browser/device | Reusing equipment and its GIF previews across layouts. |
| Portable scene JSON | A file you export | Reopening or transferring a scene with its geometry and animation, without cloud services. |
| Cloud scene | Your signed-in Supabase account | Saving named scenes across devices. Enable **Include cloud geometry** when saving if the other device needs the models. |
| Cloud files | Optional private Supabase Storage | Explicitly uploading geometry bundles, GIF previews, and supported source attachments. |

Browser storage is subject to quota and eviction, so export a scene file for a portable copy. Signing in does not automatically upload your imported files. A metadata-only cloud scene may show missing-geometry placeholders on another device until you provide the source assets. See [cloud storage setup](docs/cloud-storage.md) for enabling geometry transfers.

## Run locally

### Browser workbench

Install **Node.js 22** and Git, then run:

```bash
git clone https://github.com/caid-technologies/Forma-Industries.git
cd Forma-Industries
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. The development command starts both Vite and the local API server. To view the bundled example, open <http://127.0.0.1:5173/?scene=cleanroom>.

Python, provider API keys, and Supabase configuration are optional for local imports, room editing, animation, the device library, and exports.

To serve a production build locally:

```bash
npm run build
npm start
```

Open <http://127.0.0.1:8787>.

### Optional services

Copy [`.env.example`](.env.example) to `.env` when you need configuration. Restart development or rebuild after changing browser variables.

| Feature | Setup |
| --- | --- |
| Local **Build with Forma** | Install Python 3.11+ and `requirements-forma.txt` into `.venv`. Follow the [local generation guide](docs/development.md#local-forma-generation), then try **Deterministic demo** without provider credentials. |
| Live Forma generation | Configure server-side provider credentials in `.env` and select a provider/model in the UI. Live provider calls have not yet been verified in this project. |
| GitHub sign-in and cloud scenes | Configure Supabase Auth/Postgres and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. See [Auth/database setup](supabase/README.md). |
| Private cloud geometry and GIFs | Apply the storage migrations and set `VITE_CLOUD_STORAGE_ENABLED=true`. See the [storage guide](docs/cloud-storage.md). |
| Hide local generation controls | Set `VITE_FORMA_GENERATION_ENABLED=false` if you generate equipment separately and only need to import it. |
| Local agents and CLI | See [OpenCode/MCP setup](docs/development.md#optional-forma-mcp-demo), [room creation through MCP](docs/development.md#create-rooms-through-mcp), and the [Astra CLI](docs/development.md#astra-cli). |

Only public Supabase browser configuration belongs in `VITE_` variables. Provider credentials and Supabase service-role keys must stay out of the browser bundle.

## Technology and repository map

| Part | Technology | Location |
| --- | --- | --- |
| Browser interface | React 19, TypeScript, Vite | [`src/main.tsx`](src/main.tsx), [`src/components/`](src/components/) |
| 3D workspace and animation | Three.js | [`src/lib/`](src/lib/), [`src/components/workspace-viewer.tsx`](src/components/workspace-viewer.tsx) |
| STEP conversion | `occt-import-js` / OpenCascade WebAssembly in a worker | [`src/lib/step.ts`](src/lib/step.ts), [`public/step-worker.js`](public/step-worker.js) |
| GIF export | `gifenc`, rendered in the browser | [`src/lib/gif.ts`](src/lib/gif.ts) |
| Cloud accounts and persistence | Supabase Auth, Postgres, optional private Storage | [`supabase/`](supabase/), [`src/lib/scene-repository.ts`](src/lib/scene-repository.ts) |
| Local Forma bridge and agent tools | Node.js/Express, Python `caid-forma-core==0.3.5`, MCP | [`server/`](server/), [`opencode.json`](opencode.json) |
| Room transfer CLI | Node.js | [`cli/astra.mjs`](cli/astra.mjs) |
| Verification and examples | Model tests, browser smoke tests, bundled scenes | [`scripts/`](scripts/), [`public/examples/cleanroom/`](public/examples/cleanroom/) |

## Current scope and limitations

Astra is a working prototype for spatial planning and visual review. Keep these boundaries in mind when evaluating the demo:

- **Animation is visual.** Keyframes illustrate movement; they do not provide physics simulation, collision guarantees, electrical revalidation, or manufacturing approval.
- **Space briefs use presets and planning envelopes.** These placeholders represent equipment positions and sizes. Replace them with Forma-authored projects or CAD for detailed review.
- **The cleanroom route is illustrative.** Its access schedule is example data, and the mostly fused robot CAD uses whole-robot approach/retract motion to approximate sampling. See the [example notes](public/examples/cleanroom/README.md).
- **Imports have practical limits.** Equipment imports are capped at 25 MiB per file, 75 MiB per batch, and 2 million vertices per asset. Large assemblies and STEP variants still need broader validation.
- **Companion CAD must be selected explicitly.** Astra does not automatically fetch remote CAD URLs or server-local paths. Missing CAD uses labeled envelopes when the project provides them, or reports an error.
- **Agent integration is optional and local.** The local workbench supports imports and visual review; the Forma generation and feedback bridge uses the local API server. Design changes go through an explicit review and reimport loop.

## Development checks

For the TypeScript build and model/contract checks:

```bash
npm run build
npm run test:cad
npm run test:scene
npm run test:workspace
npm run test:mcp
```

For browser smoke tests, run `npm start` in another terminal after building, then run `npm test`, `npm run test:gif`, or `npm run test:fullscreen`. These need Chrome. The main `npm test` suite also needs the Python Forma installation and network access for a STEP fixture; the GIF suite does not need those two dependencies. Screenshots go to `test-results/`.

Live cloud tests need a dedicated Supabase test project and test-only credentials; follow the [workspace](docs/workspace.md#verification) and [storage](docs/cloud-storage.md#verification) guides.

## Documentation

- [Workspace guide](docs/workspace.md) — editing, animation, persistence, missing-geometry recovery, and the inspector.
- [Forma handoff contract](docs/forma-handoff.md) — compiled artifacts, supported formats, provenance, and CAD resolution.
- [Development and integration guide](docs/development.md) — local generation, MCP, CLI, import contracts, and GIF details.
- [Cloud storage guide](docs/cloud-storage.md) — private asset transfers, setup, limits, and lifecycle.
- [Supabase Auth and database setup](supabase/README.md) — schema, GitHub login, migrations, and ownership checks.
- [Cleanroom example](public/examples/cleanroom/README.md) — scene behavior, source models, and CAD licensing.

## Third-party software

Forma OSS / Forma Core is used under **MPL-2.0**; preserve applicable notices and obligations when reusing upstream code. STEP conversion uses `occt-import-js` and its OpenCascade/WebAssembly distribution; retain their bundled license notices. GIF encoding uses `gifenc` (MIT), and the test decoder is `omggif` (MIT).

The cleanroom robot and workbench source projects declare their mechanical CAD under **CERN-OHL-S-2.0**; see the [example provenance notes](public/examples/cleanroom/README.md). Upstream STEP test geometry is fetched by the smoke test rather than bundled in this repository.
