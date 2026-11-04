# Test corpus

`.puml` files that the round-trip, classification and oracle suites read (FR-010/AC6, SC-004, SC-005). Every file must round-trip byte-identically: open, then download without edits, gives the same bytes.

## Folders

Each folder belongs to the task that created it. Add files only to your own folder.

| Folder | Owner | Holds |
| ------ | ----- | ----- |
| `fidelity/` | T009 | CRLF, byte-order mark, no final newline, comments and text between blocks, non-English names |
| `import/` | T020 | One file per source category and per unsupported or edge construct (section 4, EC-01, EC-08–EC-11) |
| `escaping/` | T040 | `cases.json`: every FR-003/AC6 text, checked through the escape writers and the oracle |
| `reference/` | T174 | The SC-006 performance reference project |

Bytes matter here. `.gitattributes` marks the corpus `-text` so git never rewrites line endings.

## Expected results: `<file>.expected.json`

Each `.puml` file has a sidecar with the same base name. The classification suite (T045) compares the editor's view of the file with it:

```json
{
  "flowIndex": 1,
  "blocks": [
    { "kind": "screen", "status": "Editable", "name": "Sign-in", "nameFlag": null },
    { "kind": "flow", "status": "Has locked parts", "name": "Screen-flow", "nameFlag": null, "reasonKey": "locked.fork" }
  ]
}
```

| Field | Values |
| ----- | ------ |
| `flowIndex` | Index of the screen-flow block in file order, or `null` |
| `kind` | `screen`, `flow`, `other` |
| `status` | `Editable`, `Has locked parts`, `Source only`, `Error`, `Older format`, `Cannot be rendered` (the renderer-independent part only) |
| `name` | The name as written after `@start…`, or `null` |
| `nameFlag` | `not-allowed`, `not-nfc`, `duplicate` or `null` |
| `reasonKey` | Optional. The message key of the status reason, checked when present |
| `line` | Optional. For `Error`, the 1-based line within the block |
| `comment` | Optional. A note for readers; not checked |
