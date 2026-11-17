const files = [
  {
    id: "base",
    name: "base.scad",
    body: "size = width; cube([size,10,5]); // end comment",
  },
  {
    id: "tool",
    name: "tool.scad",
    body: "size = 10; translate([15,0,-1]) cube([size,10,7]);",
  },
];
const objects = [
  { id: "body", name: "Body", fileId: "base" },
  { id: "cut", name: "Cut", fileId: "tool" },
];

export function compositionSnapshot(operation, presentation) {
  return structuredClone({
    version: presentation ? 2 : 1,
    files,
    objects,
    composition: { operation, objectIds: ["body", "cut"] },
    ...(presentation ? { presentation } : {}),
  });
}

export function presentation(overrides = {}) {
  return {
    fileOrder: ["tool", "base"],
    objectOrder: ["cut", "body"],
    hiddenFileIds: [],
    hiddenObjectIds: [],
    ...overrides,
  };
}

export const compositionCases = [
  ["legacy-union", "union", 20, [0, 0, -1], [25, 10, 6]],
  ["legacy-difference", "difference", 20, [0, 0, 0], [15, 10, 5]],
  ["legacy-intersection", "intersection", 20, [15, 0, 0], [20, 10, 5]],
  ["parameter-change", "union", 30, [0, 0, -1], [30, 10, 6]],
  ["display-order", "difference", 20, [0, 0, 0], [15, 10, 5], presentation()],
  [
    "hidden-object-union",
    "union",
    20,
    [0, 0, 0],
    [20, 10, 5],
    presentation({ hiddenObjectIds: ["cut"] }),
  ],
  [
    "hidden-file-union",
    "union",
    20,
    [15, 0, -1],
    [25, 10, 6],
    presentation({ hiddenFileIds: ["base"] }),
  ],
  [
    "hidden-subtractor",
    "difference",
    20,
    [0, 0, 0],
    [20, 10, 5],
    presentation({ hiddenFileIds: ["tool"] }),
  ],
  [
    "hidden-intersection-operand",
    "intersection",
    20,
    [0, 0, 0],
    [20, 10, 5],
    presentation({ hiddenObjectIds: ["cut"] }),
  ],
  [
    "internal-cutout",
    "difference",
    20,
    [0, 0, 0],
    [20, 10, 5],
    presentation(),
    "translate([5,2,-1]) cube([5,6,7]);",
  ],
];

export const expectedVolumes = {
  "legacy-union": 1450,
  "legacy-difference": 750,
  "legacy-intersection": 250,
  "parameter-change": 1700,
  "display-order": 750,
  "hidden-object-union": 1000,
  "hidden-file-union": 700,
  "hidden-subtractor": 1000,
  "hidden-intersection-operand": 1000,
  "internal-cutout": 850,
  "restore-v1": 1450,
  "restore-v2": 1000,
};

export const invalidCompositions = [
  compositionSnapshot(
    "union",
    presentation({ hiddenFileIds: ["base", "tool"] }),
  ),
  compositionSnapshot(
    "union",
    presentation({ hiddenObjectIds: ["body", "cut"] }),
  ),
  compositionSnapshot("difference", presentation({ hiddenFileIds: ["base"] })),
  compositionSnapshot(
    "difference",
    presentation({ hiddenObjectIds: ["body"] }),
  ),
  {
    ...compositionSnapshot("union", presentation()),
    composition: { operation: "union", objectIds: ["missing", "cut"] },
  },
];
