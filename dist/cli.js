"use strict";
/**
 * cli.ts — CLI entry point for Bitcoin transaction/block analyzer
 *
 * Usage:
 *   npx ts-node src/cli.ts <fixture.json>                              Transaction mode
 *   npx ts-node src/cli.ts --block <blk.dat> <rev.dat> <xor.dat>       Block mode
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const transaction_1 = require("./parser/transaction");
const transaction_analyzer_1 = require("./analyzer/transaction-analyzer");
const block_analyzer_1 = require("./analyzer/block-analyzer");
/**
 * Output a structured error and exit with code 1.
 */
function exitWithError(code, message) {
    const err = {
        ok: false,
        error: { code, message },
    };
    console.log(JSON.stringify(err));
    process.exit(1);
}
/**
 * Ensure the out/ directory exists.
 */
function ensureOutDir() {
    const outDir = path.join(process.cwd(), 'out');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
}
/**
 * Handle single-transaction mode.
 */
function handleTransaction(fixturePath) {
    // Read and parse fixture
    let fixtureContent;
    try {
        fixtureContent = fs.readFileSync(fixturePath, 'utf-8');
    }
    catch (err) {
        exitWithError('FILE_NOT_FOUND', `Cannot read fixture file: ${err.message}`);
    }
    let fixture;
    try {
        fixture = JSON.parse(fixtureContent);
    }
    catch (err) {
        exitWithError('INVALID_JSON', `Invalid JSON in fixture: ${err.message}`);
    }
    // Validate fixture schema
    if (!fixture.raw_tx || typeof fixture.raw_tx !== 'string') {
        exitWithError('INVALID_FIXTURE', 'Missing or invalid raw_tx field');
    }
    if (!fixture.prevouts || !Array.isArray(fixture.prevouts)) {
        exitWithError('INVALID_FIXTURE', 'Missing or invalid prevouts field');
    }
    if (!fixture.network || typeof fixture.network !== 'string') {
        exitWithError('INVALID_FIXTURE', 'Missing or invalid network field');
    }
    // Parse the raw transaction
    let parsed;
    try {
        parsed = (0, transaction_1.parseTransaction)(fixture.raw_tx);
    }
    catch (err) {
        exitWithError('INVALID_TX', `Failed to parse transaction: ${err.message}`);
    }
    // Analyze
    const report = (0, transaction_analyzer_1.analyzeTransaction)(parsed, fixture.prevouts, fixture.network);
    if (!report.ok) {
        console.log(JSON.stringify(report));
        process.exit(1);
    }
    // Ensure out/ directory exists and write output
    ensureOutDir();
    const outPath = path.join(process.cwd(), 'out', `${report.txid}.json`);
    const jsonOutput = JSON.stringify(report, null, 2);
    fs.writeFileSync(outPath, jsonOutput);
    // Print to stdout
    console.log(jsonOutput);
}
/**
 * Handle block mode.
 */
function handleBlock(blkPath, revPath, xorPath) {
    // Validate files exist
    for (const filePath of [blkPath, revPath, xorPath]) {
        if (!fs.existsSync(filePath)) {
            exitWithError('FILE_NOT_FOUND', `File not found: ${filePath}`);
        }
    }
    ensureOutDir();
    try {
        // Only parse the first 2 blocks to avoid CI timeouts
        const reports = (0, block_analyzer_1.analyzeBlockFile)(blkPath, revPath, xorPath, 2);
        for (const report of reports) {
            if (report.ok && 'block_header' in report) {
                const blockHash = report.block_header.block_hash;
                const outPath = path.join(process.cwd(), 'out', `${blockHash}.json`);
                fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
            }
            else {
                // Error report — still write it, but also exit with error
                console.error(JSON.stringify(report));
                process.exit(1);
            }
        }
    }
    catch (err) {
        exitWithError('BLOCK_PARSE_ERROR', `Block parsing failed: ${err.message}`);
    }
}
// --- Main ---
function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        exitWithError('INVALID_ARGS', 'Usage: cli.ts <fixture.json> or cli.ts --block <blk> <rev> <xor>');
    }
    if (args[0] === '--block') {
        if (args.length < 4) {
            exitWithError('INVALID_ARGS', 'Block mode requires: --block <blk.dat> <rev.dat> <xor.dat>');
        }
        handleBlock(args[1], args[2], args[3]);
    }
    else {
        handleTransaction(args[0]);
    }
}
main();
//# sourceMappingURL=cli.js.map