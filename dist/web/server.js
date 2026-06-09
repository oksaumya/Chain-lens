"use strict";
/**
 * server.ts — Express web server for Bitcoin transaction visualizer
 *
 * Provides:
 *   - GET  /api/health     -> { ok: true }
 *   - POST /api/analyze     -> Analyzes a transaction fixture
 *   - POST /api/analyze-block -> Analyzes block files
 *   - GET  /                -> Web visualizer UI
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const transaction_1 = require("../parser/transaction");
const transaction_analyzer_1 = require("../analyzer/transaction-analyzer");
const block_analyzer_1 = require("../analyzer/block-analyzer");
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '3000', 10);
app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (_req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});
// Parse JSON bodies up to 50MB (for large block data)
app.use(express_1.default.json({ limit: '500mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '500mb' }));
// Serve static files from the public directory
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
    ? path.join(__dirname, 'public')
    : path.join(__dirname, '..', '..', 'dist', 'web', 'public');
app.use(express_1.default.static(publicDir));
/**
 * Health check endpoint.
 */
app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
});
/**
 * Analyze a transaction from fixture JSON.
 * Accepts the fixture JSON in the request body.
 */
app.post('/api/analyze', (req, res) => {
    try {
        const fixture = req.body;
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
        const parsed = (0, transaction_1.parseTransaction)(fixture.raw_tx);
        const report = (0, transaction_analyzer_1.analyzeTransaction)(parsed, fixture.prevouts, network);
        res.json(report);
    }
    catch (err) {
        res.status(500).json({
            ok: false,
            error: { code: 'ANALYSIS_ERROR', message: err.message || String(err) },
        });
    }
});
/**
 * Analyze block files uploaded as base64-encoded data.
 */
const multer_1 = __importDefault(require("multer"));
const upload = (0, multer_1.default)({
    dest: os.tmpdir(),
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});
app.post('/api/analyze-block', upload.fields([
    { name: 'blk', maxCount: 1 },
    { name: 'rev', maxCount: 1 },
    { name: 'xor', maxCount: 1 }
]), (req, res) => {
    const files = req.files;
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
        const reports = (0, block_analyzer_1.analyzeBlockFile)(blkPath, revPath, xorPath, 2);
        res.json({ ok: true, blocks: reports });
    }
    catch (err) {
        res.status(500).json({
            ok: false,
            error: { code: 'BLOCK_ANALYSIS_ERROR', message: err.message || String(err) },
        });
    }
    finally {
        // Cleanup temporary files
        try {
            if (fs.existsSync(blkPath))
                fs.unlinkSync(blkPath);
            if (fs.existsSync(revPath))
                fs.unlinkSync(revPath);
            if (fs.existsSync(xorPath))
                fs.unlinkSync(xorPath);
        }
        catch (cleanupErr) {
            console.error('Error cleaning up temp files:', cleanupErr);
        }
    }
});
/**
 * List available transaction fixtures.
 */
app.get('/api/fixtures', (_req, res) => {
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
    }
    catch (err) {
        res.json({ ok: true, fixtures: [] });
    }
});
/**
 * Get a specific transaction fixture by name.
 */
app.get('/api/fixtures/:name', (req, res) => {
    try {
        const name = req.params.name;
        const filePath = path.join(__dirname, '..', '..', 'fixtures', 'transactions', `${name}.json`);
        if (!fs.existsSync(filePath)) {
            res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Fixture not found' } });
            return;
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ ok: false, error: { code: 'READ_ERROR', message: err.message } });
    }
});
/**
 * Serve the main visualization page.
 */
app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});
// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`http://127.0.0.1:${PORT}`);
});
//# sourceMappingURL=server.js.map