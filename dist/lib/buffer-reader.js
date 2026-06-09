"use strict";
/**
 * buffer-reader.ts — Efficient binary buffer reader with cursor tracking
 *
 * Reads Bitcoin serialization primitives (little-endian integers,
 * variable-length integers, fixed-size byte sequences) from a Buffer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufferReader = void 0;
class BufferReader {
    buffer;
    offset;
    constructor(buffer, offset = 0) {
        this.buffer = buffer;
        this.offset = offset;
    }
    /** Remaining bytes available to read */
    get remaining() {
        return this.buffer.length - this.offset;
    }
    /** Whether the reader has reached the end of the buffer */
    get eof() {
        return this.offset >= this.buffer.length;
    }
    /** Read a single unsigned byte */
    readUInt8() {
        this.ensureAvailable(1);
        const val = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return val;
    }
    /** Read a 16-bit unsigned integer (little-endian) */
    readUInt16LE() {
        this.ensureAvailable(2);
        const val = this.buffer.readUInt16LE(this.offset);
        this.offset += 2;
        return val;
    }
    /** Read a 32-bit unsigned integer (little-endian) */
    readUInt32LE() {
        this.ensureAvailable(4);
        const val = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return val;
    }
    /** Read a 32-bit signed integer (little-endian) */
    readInt32LE() {
        this.ensureAvailable(4);
        const val = this.buffer.readInt32LE(this.offset);
        this.offset += 4;
        return val;
    }
    /** Read a 64-bit unsigned integer (little-endian) as number */
    readUInt64LE() {
        this.ensureAvailable(8);
        const lo = this.buffer.readUInt32LE(this.offset);
        const hi = this.buffer.readUInt32LE(this.offset + 4);
        this.offset += 8;
        return hi * 0x100000000 + lo;
    }
    /** Read a Bitcoin variable-length integer (CompactSize) */
    readVarInt() {
        const first = this.readUInt8();
        if (first < 0xfd)
            return first;
        if (first === 0xfd)
            return this.readUInt16LE();
        if (first === 0xfe)
            return this.readUInt32LE();
        return this.readUInt64LE();
    }
    /** Read exactly n bytes as a new Buffer */
    readBytes(n) {
        this.ensureAvailable(n);
        const slice = this.buffer.slice(this.offset, this.offset + n);
        this.offset += n;
        return Buffer.from(slice);
    }
    /** Peek at the next byte without advancing the cursor */
    peekUInt8() {
        this.ensureAvailable(1);
        return this.buffer.readUInt8(this.offset);
    }
    /** Skip n bytes */
    skip(n) {
        this.ensureAvailable(n);
        this.offset += n;
    }
    /** Get the raw buffer slice from start to current offset */
    sliceFrom(start) {
        return Buffer.from(this.buffer.slice(start, this.offset));
    }
    /** Get the underlying buffer */
    getBuffer() {
        return this.buffer;
    }
    /** Ensure n bytes are available to read */
    ensureAvailable(n) {
        if (this.offset + n > this.buffer.length) {
            throw new Error(`Buffer overrun at offset ${this.offset}: need ${n} bytes, have ${this.remaining}`);
        }
    }
}
exports.BufferReader = BufferReader;
//# sourceMappingURL=buffer-reader.js.map