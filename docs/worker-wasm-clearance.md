# Pinned WASM provenance and proprietary licensing review

October 30, 2026; THE-15 remains In Progress. The owner chose to retain WASM and
keep TheoryFoundry proprietary. No CLI replacement, renderer-pin change,
relicensing, upstream message or npm publication is performed by this work.

## New evidence from the delivered binary

Run with pinned Node 24, repository dependencies and an already installed Chromium:

```sh
pnpm prepare:browser-renderer
pnpm --filter @theoryfoundry/contracts build
node tooling/local-worker/probeOpenScad.script.mjs
```

The probe checks both assets against the existing contract hashes before loading
them in sandboxed Chromium. Browser requests are fulfilled from an in-memory
allowlist; no listener, hosted credentials, external fetch or host filesystem mount
is supplied. It closes the browser and imposes a 30-second overall timeout. It does
not download Chromium. The preparation command may download the pinned assets.

[Recorded output](worker-wasm-metadata.json) reports:

- OpenSCAD `2026.07.20 (git e4fdec49)`. GitHub resolves the prefix to
  [`e4fdec49730103274a4e21c2390b9a12882f01aa`](https://github.com/openscad/openscad/commit/e4fdec49730103274a4e21c2390b9a12882f01aa).
- Emscripten 4.0.10; Clang 21.0.0git, LLVM revision
  `8f7e57485ee73205e108d74abb5565d5c63beaca`.
- Boost 1_87; Eigen 3.4.90; CGAL 6.0.1-I-900; Clipper2 2.0.1;
  Manifold 3.5.1; GLib 2.83.2; lodepng 20260102; libzip 1.11.4;
  fontconfig 2.16.2; freetype 2.13.3; harfbuzz 11.2.1; lib3mf 2.3.2.
- Qt, OpenCSG, cairo and mimalloc are reported disabled. This is not a complete
  linked-dependency inventory; inspect the actual link/build record as well.

`--version` emits the date then throws an Emscripten exit/abort message. `--info`
emits the metadata then exits 1 because it cannot create an OpenGL offscreen view.
These are metadata observations, not successful render acceptance. The probe
requires the expected version metadata to be present and records command errors.
The upstream [version command](https://github.com/openscad/openscad/blob/e4fdec49730103274a4e21c2390b9a12882f01aa/src/openscad.cc)
prints only the short version; that explains why its output alone lacked the hash.

## Build-image and source findings

The public Docker Hub tag listing currently has one `openscad/wasm-base-release`
tag, `latest`, last pushed June 14, 2025. Its immutable linux/amd64 manifest is
`sha256:f73d33d5f2fd4c7ae4d3aaacb1e2e2deb193b878b38bb80c8235c933ac340c66`.
The registry config is
`sha256:c150e52895809b6df1cfbdad8fa0035bd789708081a43c9e775cbc5a186a1f78`,
created June 14, 2025 at 20:57:48 UTC. These were fetched from the public registry
without pulling or executing the 783 MB compressed image. The labels identify
the Emscripten SDK but do not attest an OpenSCAD dependency-source checkout.

Sources: [tag metadata](https://hub.docker.com/v2/repositories/openscad/wasm-base-release/tags?page_size=100),
[upstream image](https://hub.docker.com/r/openscad/wasm-base-release).
Its age and Emscripten version are supporting evidence, not proof of the digest
resolved by the July 20 job. Request that association from upstream.

The last upstream WASM repository commit before the snapshot is
[`ed3fd464ad9a08be152d43ea68cbdb6e34a60d6b`](https://github.com/openscad/openscad-wasm/commit/ed3fd464ad9a08be152d43ea68cbdb6e34a60d6b).
Its [Makefile](https://github.com/openscad/openscad-wasm/blob/ed3fd464ad9a08be152d43ea68cbdb6e34a60d6b/Makefile)
selects Emscripten 4.0.10 and pins some release archives/tags, but clones several
other dependencies from moving branches. Matching reported versions does not
recover exact commits or patches. Today's main branch has different dependency
selection; do not substitute it for the historical build recipe.

The OpenSCAD commit's recorded first-level gitlinks include:

| Path                        | Commit                                   |
| --------------------------- | ---------------------------------------- |
| libraries/MCAD              | 1ea402208c3127ffb443931e9bb1681c191dacca |
| submodules/Clipper2         | c7f820f6a03fa91f189b866d27bf40dfe47abaa6 |
| submodules/OpenCSG          | 9bf122715213dca05e70993dd8672fe3aa36c518 |
| submodules/manifold         | cc8a7f66d7d5a560da94346258c5b546af27811e |
| submodules/mimalloc         | 30b2d9d89099bee08e9f67a1ffb3e12e7ba45227 |
| submodules/sanitizers-cmake | bcb1fc68616e9645ca5acea2992412606373ab04 |

These are repository references, not a collected recursive corresponding-source
bundle or proof every submodule was linked. The packaged `licenses/openscad.txt`
matches that commit's [COPYING](https://github.com/openscad/openscad/blob/e4fdec49730103274a4e21c2390b9a12882f01aa/COPYING)
exactly (Git blob `627c964a841a48896bf9c779e7b051dd3cbfd2d7`), including the CGAL
exception. That exception is not permission to license TheoryFoundry's integration
proprietarily.

## Review both delivered combinations

The npm artifact includes OpenSCAD JS/WASM and a TheoryFoundry JS worker that
imports the upstream module, instantiates it, accesses `FS` and `ENV`, calls
`callMain`, and reads output bytes. The outer browser-worker messages do not remove
these direct calls within the same JS worker. Three.js consumes the resulting mesh;
OAuth/project services live outside the renderer. Review the actual dependency
graph and delivered bundles, not simply the presence of separate files.

The website also sends the same integration and JS/WASM to users' browsers.
Therefore this review must cover browser distribution as well as npm. THE-9 owns
the broader browser acceptance journey; this finding does not complete its tests.

The official [OpenSCAD Playground license inventory](https://github.com/openscad/openscad-playground/blob/main/LICENSE.md)
describes its own deployment under GPLv3 because of linked dependencies. This does
not establish the license of our exact snapshot or grant TheoryFoundry permission;
it is a concrete reason to review all linked components and the applicable GPL
version rather than relying only on OpenSCAD's GPLv2 COPYING text.

## Send-ready upstream inquiry — not sent

To: `info@openscad.org`, the [official general-inquiry contact](https://openscad.org/about.html#contact).
Subject: Source/build provenance and licensing contact for July 20, 2026 WASM

> Hello OpenSCAD maintainers,
>
> We are reviewing TheoryFoundry's use of the unmodified official
> OpenSCAD-2026.07.20-WebAssembly-web.zip, SHA-256
> 8b81d3d025f29bc1dec40a2ce5acbad5bd06a0f568c1bfa1f6572ad5baa97dcd.
> Its --info reports 2026.07.20 (git e4fdec49), Emscripten 4.0.10, CGAL
> 6.0.1-I-900, Manifold 3.5.1 and lib3mf 2.3.2.
>
> Could you confirm the full source revision and producing build/job, and provide
> the corresponding source/build materials, recursive dependencies, patches and
> notices? The currently published openscad/wasm-base-release:latest resolves to
> sha256:f73d33d5f2fd4c7ae4d3aaacb1e2e2deb193b878b38bb80c8235c933ac340c66
> (June 14, 2025). Was this the image used? The historical recipe clones some
> dependencies from moving branches, so we cannot reconstruct their exact source
> from version strings alone. Is there a maintained complete source bundle?
>
> Separately, our intended npm worker is proprietary. Its JavaScript imports the
> Emscripten module inside a browser worker, uses FS/ENV, invokes callMain with SCAD
> input, and reads STL/3MF output. The hosted website delivers the same WASM/JS
> integration to browsers. We have not published the npm worker and are reviewing
> both delivery paths. We do not assume that separate files or an outer worker
> boundary permit proprietary distribution.
>
> Is there an existing licensing exception or other permission applicable to
> this integration? If permission would need to be negotiated, who can address
> the necessary rights, including linked components? We will obtain a separate
> qualified review of the actual deliverables before treating this as clearance.
> We can provide a concise interface diagram without disclosing proprietary code.
>
> Thank you.

No credentials, user models, private repository links or proprietary source are
included. Sending is a separate owner-authorized action; the connected tools do
not include email delivery. The owner can send this draft through their email.

## Required written resolution

| Question                    | Evidence needed before publication                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact corresponding source  | Confirmed archive-to-source/build association; exact dependency revisions and patches; build/install scripts and required notices; an actual source-delivery arrangement reviewed for the applicable terms.                                                   |
| Proprietary combination     | A qualified assessment covering direct module integration in both npm and browser delivery, all relevant component licenses, and any required permission from the appropriate rights holders. A generic maintainer acknowledgment is not a blanket exception. |
| Source delivery obligations | Review whether the proposed bundle, download or written offer satisfies the actual license and delivery mode, including availability obligations. Do not present the existing generic repository link as sufficient.                                          |
| Release artifact            | Inspect the exact final tarball and website assets against that resolution, add required source/notices, then repeat candidate and registry acceptance before publication.                                                                                    |

Keep evidence in this audit and THE-15. If retaining the exact integration cannot
meet the owner's proprietary requirement, report that conflict and keep publication
blocked; do not silently open TheoryFoundry source, change engines, or infer consent
from upstream silence.
