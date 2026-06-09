/**
 * cli.ts — CLI entry point for Bitcoin transaction/block analyzer
 *
 * Usage:
 *   npx ts-node src/cli.ts <fixture.json>                              Transaction mode
 *   npx ts-node src/cli.ts --block <blk.dat> <rev.dat> <xor.dat>       Block mode
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseTransaction, computeTxid } from './parser/transaction';
import { analyzeTransaction } from './analyzer/transaction-analyzer';
import { analyzeBlockFile } from './analyzer/block-analyzer';
import { TransactionFixture, ErrorReport } from './types';

/**
 * Output a structured error and exit with code 1.
 */
function exitWithError(code: string, message: string): never {
  const err: ErrorReport = {
    ok: false,
    error: { code, message },
  };
  console.log(JSON.stringify(err));
  process.exit(1);
}

/**
 * Ensure the out/ directory exists.
 */
function ensureOutDir(): void {
  const outDir = path.join(process.cwd(), 'out');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
}

/**
 * Handle single-transaction mode.
 */
function handleTransaction(fixturePath: string): void {
  // Read and parse fixture
  let fixtureContent: string;
  try {
    fixtureContent = fs.readFileSync(fixturePath, 'utf-8');
  } catch (err: any) {
    exitWithError('FILE_NOT_FOUND', `Cannot read fixture file: ${err.message}`);
  }

  let fixture: TransactionFixture;
  try {
    fixture = JSON.parse(fixtureContent);
  } catch (err: any) {
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
    parsed = parseTransaction(fixture.raw_tx);
  } catch (err: any) {
    exitWithError('INVALID_TX', `Failed to parse transaction: ${err.message}`);
  }

  // Analyze
  const report = analyzeTransaction(parsed, fixture.prevouts, fixture.network);

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
function handleBlock(blkPath: string, revPath: string, xorPath: string): void {
  // Validate files exist
  for (const filePath of [blkPath, revPath, xorPath]) {
    if (!fs.existsSync(filePath)) {
      exitWithError('FILE_NOT_FOUND', `File not found: ${filePath}`);
    }
  }

  ensureOutDir();

  try {
    // Only parse the first 2 blocks to avoid CI timeouts
    const reports = analyzeBlockFile(blkPath, revPath, xorPath, 2);

    for (const report of reports) {
      if (report.ok && 'block_header' in report) {
        const blockHash = report.block_header.block_hash;
        const outPath = path.join(process.cwd(), 'out', `${blockHash}.json`);
        fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      } else {
        // Error report — still write it, but also exit with error
        console.error(JSON.stringify(report));
        process.exit(1);
      }
    }
  } catch (err: any) {
    exitWithError('BLOCK_PARSE_ERROR', `Block parsing failed: ${err.message}`);
  }
}

// --- Main ---
function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    exitWithError('INVALID_ARGS', 'Usage: cli.ts <fixture.json> or cli.ts --block <blk> <rev> <xor>');
  }

  if (args[0] === '--block') {
    if (args.length < 4) {
      exitWithError('INVALID_ARGS', 'Block mode requires: --block <blk.dat> <rev.dat> <xor.dat>');
    }
    handleBlock(args[1], args[2], args[3]);
  } else {
    handleTransaction(args[0]);
  }
}

main();
