/**
 * server.ts — Express web server for Bitcoin transaction visualizer
 *
 * Provides:
 *   - GET  /api/health     -> { ok: true }
 *   - POST /api/analyze     -> Analyzes a transaction fixture
 *   - POST /api/analyze-block -> Analyzes block files
 *   - GET  /                -> Web visualizer UI
 */

import express, { Request, Response, NextFunction } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parseTransaction } from '../parser/transaction';
import { analyzeTransaction } from '../analyzer/transaction-analyzer';
import { analyzeBlockFile } from '../analyzer/block-analyzer';
import { TransactionFixture } from '../types';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// Parse JSON bodies up to 50MB (for large block data)
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Serve static files from the public directory
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', '..', 'dist', 'web', 'public');

app.use(express.static(publicDir));

/**
 * Health check endpoint.
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/**
 * Analyze a transaction from fixture JSON.
 * Accepts the fixture JSON in the request body.
 */
app.post('/api/analyze', (req: Request, res: Response) => {
  try {
    const fixture: TransactionFixture = req.body;

    // Validate fixture
    if (!fixture.raw_tx || typeof fixture.raw_tx !== 'string') {
      res.status(400).json({
        ok: false,
        error: { code: 'INVALID_FIXTURE', message: 'Missing or invalid raw_tx field' },
      });
      return;
    }
    if (!fixture.prevouts || !Array.isArray(fixture.prevouts)) {
      res.status(400).json({
        ok: false,
        error: { code: 'INVALID_FIXTURE', message: 'Missing or invalid prevouts field' },
      });
      return;
    }

    const network = fixture.network || 'mainnet';

    // Parse and analyze
    const parsed = parseTransaction(fixture.raw_tx);
    const report = analyzeTransaction(parsed, fixture.prevouts, network);

    res.json(report);
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: { code: 'ANALYSIS_ERROR', message: err.message || String(err) },
    });
  }
});

/**
 * Analyze block files uploaded as base64-encoded data.
 */
import multer from 'multer';

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

app.post('/api/analyze-block', upload.fields([
  { name: 'blk', maxCount: 1 },
  { name: 'rev', maxCount: 1 },
  { name: 'xor', maxCount: 1 }
]), (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  if (!files || !files['blk'] || !files['rev'] || !files['xor']) {
    res.status(400).json({
      ok: false,
      error: { code: 'MISSING_DATA', message: 'blk, rev, and xor files required' },
    });
    return;
  }

  const blkPath = files['blk'][0].path;
  const revPath = files['rev'][0].path;
  const xorPath = files['xor'][0].path;

  try {
    const reports = analyzeBlockFile(blkPath, revPath, xorPath, 2);
    res.json({ ok: true, blocks: reports });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: { code: 'BLOCK_ANALYSIS_ERROR', message: err.message || String(err) },
    });
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(blkPath)) fs.unlinkSync(blkPath);
      if (fs.existsSync(revPath)) fs.unlinkSync(revPath);
      if (fs.existsSync(xorPath)) fs.unlinkSync(xorPath);
    } catch (cleanupErr) {
      console.error('Error cleaning up temp files:', cleanupErr);
    }
  }
});

/**
 * List available transaction fixtures.
 */
app.get('/api/fixtures', (_req: Request, res: Response) => {
  try {
    const fixturesDir = path.join(__dirname, '..', '..', 'fixtures', 'transactions');
    if (!fs.existsSync(fixturesDir)) {
      res.json({ ok: true, fixtures: [] });
      return;
    }
    const files = fs.readdirSync(fixturesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
    res.json({ ok: true, fixtures: files });
  } catch (err: any) {
    res.json({ ok: true, fixtures: [] });
  }
});

/**
 * Get a specific transaction fixture by name.
 */
app.get('/api/fixtures/:name', (req: Request, res: Response) => {
  try {
    const name = (req.params as any).name;
    const filePath = path.join(__dirname, '..', '..', 'fixtures', 'transactions', `${name}.json`);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Fixture not found' } });
      return;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'READ_ERROR', message: err.message } });
  }
});

/**
 * Serve the main visualization page.
 */
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`http://127.0.0.1:${PORT}`);
});
