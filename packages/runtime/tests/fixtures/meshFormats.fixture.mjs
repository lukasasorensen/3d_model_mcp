export function binaryStl(triangles) {
  const edges = new Map();
  const key = (point) => point.map((value) => Math.fround(value)).join(",");
  for (const triangle of triangles) {
    for (let index = 0; index < 3; index += 1) {
      const from = key(triangle[index]);
      const to = key(triangle[(index + 1) % 3]);
      const edgeKey = from < to ? `${from}|${to}` : `${to}|${from}`;
      const edge = edges.get(edgeKey) ?? { count: 0, balance: 0 };
      edge.count += 1;
      edge.balance += from < to ? 1 : -1;
      edges.set(edgeKey, edge);
    }
  }
  const invalid = [...edges].filter(
    ([, edge]) => edge.count !== 2 || edge.balance !== 0,
  );
  if (invalid.length > 0)
    throw new Error(
      `fixture topology invalid: ${JSON.stringify(invalid.slice(0, 3))}`,
    );

  const bytes = new Uint8Array(84 + triangles.length * 50);
  const view = new DataView(bytes.buffer);
  new TextEncoder().encodeInto(
    "TheoryFoundry G006 TEST-ONLY DETERMINISTIC FIXTURE",
    bytes.subarray(0, 80),
  );
  view.setUint32(80, triangles.length, true);
  let offset = 84;
  for (const triangle of triangles) {
    offset += 12;
    for (const vertex of triangle) {
      for (const value of vertex) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
    }
    offset += 2;
  }
  return bytes;
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zip(entries) {
  const local = [];
  const central = [];
  let localOffset = 0;
  for (const [name, bytes] of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const localEntry = new Uint8Array(30 + nameBytes.length + bytes.length);
    const localView = new DataView(localEntry.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, crc32(bytes), true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localEntry.set(nameBytes, 30);
    localEntry.set(bytes, 30 + nameBytes.length);
    local.push(localEntry);

    const centralEntry = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralEntry.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc32(bytes), true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    centralEntry.set(nameBytes, 46);
    central.push(centralEntry);
    localOffset += localEntry.length;
  }
  const centralSize = central.reduce((size, entry) => size + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);

  const chunks = [...local, ...central, end];
  const output = new Uint8Array(
    chunks.reduce((size, entry) => size + entry.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export function threeMf(triangles, sourceHash) {
  const vertices = triangles.flat();
  const vertexXml = vertices
    .map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`)
    .join("");
  const triangleXml = triangles
    .map(
      (_, i) => `<triangle v1="${i * 3}" v2="${i * 3 + 1}" v3="${i * 3 + 2}"/>`,
    )
    .join("");
  const model = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="theoryfoundry:sourceHash">${sourceHash}</metadata><resources><object id="1" type="model"><mesh><vertices>${vertexXml}</vertices><triangles>${triangleXml}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  return zip([
    [
      "[Content_Types].xml",
      new TextEncoder().encode(
        `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/3D/3dmodel.model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`,
      ),
    ],
    [
      "_rels/.rels",
      new TextEncoder().encode(
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
      ),
    ],
    ["3D/3dmodel.model", new TextEncoder().encode(model)],
  ]);
}
