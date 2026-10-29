# Third-party runtime components

The package preserves TheoryFoundry's package identity and existing renderer pins.
`UNLICENSED` describes the TheoryFoundry source; it does not replace upstream terms.
Registry publication remains a separate release action.

- OpenSCAD WebAssembly snapshot 2026.07.20: https://files.openscad.org/snapshots/OpenSCAD-2026.07.20-WebAssembly-web.zip
  Upstream project/source and licensing: https://github.com/openscad/openscad
  Upstream GPL license text is included as `licenses/openscad.txt`.
  Archive SHA-256: 8b81d3d025f29bc1dec40a2ce5acbad5bd06a0f568c1bfa1f6572ad5baa97dcd.
- BOSL2 v2.0.741: https://github.com/BelfrySCAD/BOSL2/tree/v2.0.741
  The complete pinned archive, including its LICENSE and library sources, is
  included as `dist/assets/vendor/openscad/bosl2.zip`.
  SHA-256: 4fb7b58cbeadfe5f8c5a037d9e1392d774117d48423f95f4203aa367d8b1ea88.
- Three.js 0.179.1 and fflate 0.8.2 are bundled into the renderer. Their license
  texts are included in `licenses/`; generated bundles retain legal comments.
- Playwright, MCP SDK, Zod, JOSE and the native keyring adapter are installed as
  pinned npm dependencies when used by the generated entry point. Their upstream
  packages retain their own license and notice files.

Before public distribution, review the pinned OpenSCAD binary's corresponding
source/notice requirements and the intended TheoryFoundry distribution terms.
The build does not grant additional licenses or substitute a URL for a source offer.
