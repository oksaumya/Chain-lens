/**
 * block-analyzer.ts — Full block analysis
 *
 * Takes raw block + undo data and produces the complete block JSON report.
 */
import { BlockReport, ErrorReport } from '../types';
/**
 * Analyze all blocks in the given blk/rev/xor files.
 * Returns an array of block reports (one per block in the file).
 */
export declare function analyzeBlockFile(blkPath: string, revPath: string, xorPath: string, maxBlocks?: number): (BlockReport | ErrorReport)[];
//# sourceMappingURL=block-analyzer.d.ts.map