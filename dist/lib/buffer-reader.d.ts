/**
 * buffer-reader.ts — Efficient binary buffer reader with cursor tracking
 *
 * Reads Bitcoin serialization primitives (little-endian integers,
 * variable-length integers, fixed-size byte sequences) from a Buffer.
 */
export declare class BufferReader {
    private buffer;
    offset: number;
    constructor(buffer: Buffer, offset?: number);
    /** Remaining bytes available to read */
    get remaining(): number;
    /** Whether the reader has reached the end of the buffer */
    get eof(): boolean;
    /** Read a single unsigned byte */
    readUInt8(): number;
    /** Read a 16-bit unsigned integer (little-endian) */
    readUInt16LE(): number;
    /** Read a 32-bit unsigned integer (little-endian) */
    readUInt32LE(): number;
    /** Read a 32-bit signed integer (little-endian) */
    readInt32LE(): number;
    /** Read a 64-bit unsigned integer (little-endian) as number */
    readUInt64LE(): number;
    /** Read a Bitcoin variable-length integer (CompactSize) */
    readVarInt(): number;
    /** Read exactly n bytes as a new Buffer */
    readBytes(n: number): Buffer;
    /** Peek at the next byte without advancing the cursor */
    peekUInt8(): number;
    /** Skip n bytes */
    skip(n: number): void;
    /** Get the raw buffer slice from start to current offset */
    sliceFrom(start: number): Buffer;
    /** Get the underlying buffer */
    getBuffer(): Buffer;
    /** Ensure n bytes are available to read */
    private ensureAvailable;
}
//# sourceMappingURL=buffer-reader.d.ts.map