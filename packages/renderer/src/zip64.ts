import { RendererError } from "./diagnostics.js";
function invalid(): never { throw new RendererError("INVALID_ARTIFACT", "Invalid or oversized ZIP64 metadata."); }
function bounded64(view: DataView, offset: number): number {
    if (offset < 0 || offset + 8 > view.byteLength)
        return invalid();
    const value = view.getBigUint64(offset, true);
    if (value > BigInt(view.byteLength))
        return invalid();
    return Number(value);
}
/** ZIP64 is a container encoding, not permission to exceed the existing artifact budgets. */
export function zipDirectory(view: DataView, eocd: number) {
    let count = view.getUint16(eocd + 10, true), size = view.getUint32(eocd + 12, true), offset = view.getUint32(eocd + 16, true);
    let end = eocd;
    if (view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true) || view.getUint16(eocd + 8, true) !== count)
        return invalid();
    if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
        if (eocd < 20 || view.getUint32(eocd - 20, true) !== 0x07064b50 || view.getUint32(eocd - 16, true) !== 0 || view.getUint32(eocd - 4, true) !== 1)
            return invalid();
        end = bounded64(view, eocd - 12);
        if (end + 56 > eocd - 20 || view.getUint32(end, true) !== 0x06064b50 || end + 12 + bounded64(view, end + 4) !== eocd - 20 || view.getUint32(end + 16, true) || view.getUint32(end + 20, true))
            return invalid();
        count = bounded64(view, end + 32);
        size = bounded64(view, end + 40);
        offset = bounded64(view, end + 48);
        if (bounded64(view, end + 24) !== count)
            return invalid();
    }
    if (!count || count > 4096 || offset + size !== end)
        return invalid();
    return { count, size, offset, end };
}
export function zipEntrySizes(view: DataView, start: number, length: number, sizes: {
    uncompressedSize: number;
    compressedSize: number;
    localOffset?: number;
}) {
    if (start < 0 || length < 0 || start + length > view.byteLength)
        return invalid();
    const result = { ...sizes };
    if (!Object.values(result).includes(0xffffffff))
        return result;
    for (let cursor = start; cursor + 4 <= start + length;) {
        const tag = view.getUint16(cursor, true), size = view.getUint16(cursor + 2, true);
        cursor += 4;
        if (cursor + size > start + length)
            return invalid();
        if (tag === 1) {
            const fieldEnd = cursor + size;
            const read = () => { if (cursor + 8 > fieldEnd)
                return invalid(); const value = view.getBigUint64(cursor, true); cursor += 8; if (value > 25n * 1024n * 1024n)
                return invalid(); return Number(value); };
            if (result.uncompressedSize === 0xffffffff)
                result.uncompressedSize = read();
            if (result.compressedSize === 0xffffffff)
                result.compressedSize = read();
            if (result.localOffset === 0xffffffff)
                result.localOffset = read();
            return result;
        }
        cursor += size;
    }
    return invalid();
}
