# Model file and object tools (THE-57)

The project-scoped `list_model_files` and `list_model_objects` tools return the
selected revision and compact state: stable file/object IDs, names, file references,
composition and presentation. Bodies are omitted. `read_model_file` reads one file
by `fileId`; `read_model_object` reads one object by `objectId` and its referenced
file body. Both support an optional historical revision. Labels are data, never paths.

`edit_model_files` accepts `projectId`, the exact non-null `parentRevision`,
`requestId`, `toolCallId` and a batch of operations:

| Operation               | Fields                                         |
| ----------------------- | ---------------------------------------------- |
| `create_file`           | `file: {id, name, body}`                       |
| `update_file`           | `id`, `body`                                   |
| `rename_file`           | `id`, `name`                                   |
| `remove_file`           | `id`                                           |
| `set_file_visibility`   | `id`, `visible`                                |
| `reorder_files`         | `ids` (all file IDs exactly once)              |
| `create_object`         | `object: {id, name, fileId}`                   |
| `update_object`         | `id`, `fileId`                                 |
| `rename_object`         | `id`, `name`                                   |
| `remove_object`         | `id`                                           |
| `set_object_visibility` | `id`, `visible`                                |
| `set_object_transform`  | `id`, `transform: {position, rotation, scale}` |
| `reorder_objects`       | `ids` (all object IDs exactly once)            |

The batch transforms the named parent's immutable snapshot. New IDs must be unique;
updates retain IDs. References are checked after the whole batch, allowing atomic
file creation/reassignment/removal. Removing a still-referenced file fails. Each new
object appends to the explicit composition; removing an object removes that operand.
Removing a difference base is rejected: use a complete proposal with an explicit
new composition to intentionally replace it. All models retain at least one file/object.

Objects may include an optional transform. Position is a millimeter triple,
rotation is an XYZ degree triple about the local origin, and scale is a positive
factor triple. Missing transforms mean identity. Source remains independently
addressable: transforming an object does not modify the shared file. See
[direct object editing](modeling-interactions.md) for composition order and limits.

The reply contains compact candidate metadata and resulting `state`. It does not
change accepted state. Validate/render, inspect the preview, then promote that
candidate with its expected parent. Parameter definitions and values inherit from
the named parent. Replay the same parent, operations and request/tool IDs to retry;
retries after promotion return the original candidate rather than duplicate entities.
Stale promotion, invalid references, policy failures or cancelled/failed renders
leave the accepted revision unchanged. Authorization is enforced by repository reads
and proposals at each project persistence boundary.

## Initialization and compatibility

Empty and legacy projects list `state: null`. Initialize explicitly with a complete
`propose_model_source` `modelFiles` snapshot, then validate and promote. To adopt a
legacy model, read its source first and deliberately preserve the existing editable
body and parameters in the chosen files. No implicit split or destructive migration
occurs. Use `edit_model_files` only after a multi-file parent exists.

Version 1 remains readable with its frozen source assembly. File operations create
version 2 snapshots with the same files, objects and composition, plus:

```json
{
  "presentation": {
    "fileOrder": ["base-file", "cut-file"],
    "objectOrder": ["base", "cut"],
    "hiddenFileIds": [],
    "hiddenObjectIds": ["cut"]
  }
}
```

Display order is a complete permutation, independent of canonical ID-sorted storage
and boolean operand order. Renaming or reordering alone never changes source bytes.
Hidden-ID arrays are canonicalized for retry identity. File hiding affects every
object referring to that file; showing a file preserves individual hidden objects.
Hidden operands are omitted from rendered and exported geometry, including
intersection operands. A hidden original difference base never promotes a subtractor.

The renderer requires nonempty geometry: hiding all contributing operands or hiding
the original difference base is rejected with `INVALID_MODEL_FILES` before rendering.
Keep at least one contributing object and the difference base visible. This limit is
explicit; no placeholder geometry is introduced. Other empty or invalid boolean results
still fail normal rendering. Preview/export therefore use the exact validated accepted
source. Restore retains historical snapshots and source bytes without regeneration.

## Delivery and verification

No schema migration or renderer pin change is required beyond existing migration
`0020_model-files`. Upgrade strict clients for version 2 and the new tools. Root and
plugins advance 0.13.0 → 0.14.0; contracts 0.7.0 → 0.8.0; model-project 0.8.0 → 0.9.0;
MCP 0.5.0 → 0.6.0; gateway/local-worker 0.6.0 → 0.7.0; runtime 0.9.0 → 0.10.0;
site 0.11.0 → 0.12.0. Command pins and generated metadata follow these manifests.

Contract tests exercise identity, atomic batches, invalid targets/references,
presentation permutations, hidden-file semantics and difference-base protection.
Actual MCP client/server tests cover filesystem and PGlite lifecycle, parameter
inheritance, retry before/after promotion, reopen, history/restore, source-preserving
reorder and foreign-owner access. Chat registers source bodies from individual reads
and batched edits for redaction and counts file edits against proposal limits.
PGlite and fixture renderers are local evidence; hosted CI, deployment and live
acceptance remain separate. THE-59 owns pinned renderer geometry/export acceptance.
