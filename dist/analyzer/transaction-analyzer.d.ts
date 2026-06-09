/**
 * transaction-analyzer.ts — Full transaction analysis
 *
 * Takes a parsed transaction + prevouts and produces the complete
 * JSON report matching the required schema.
 */
import { ParsedTransaction, Prevout, TransactionReport, ErrorReport } from '../types';
/**
 * Analyze a parsed transaction with its prevouts.
 * Returns the full TransactionReport or ErrorReport.
 */
export declare function analyzeTransaction(parsed: ParsedTransaction, prevouts: Prevout[], network: string): TransactionReport | ErrorReport;
//# sourceMappingURL=transaction-analyzer.d.ts.map