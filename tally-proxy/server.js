/**
 * Tally CORS Proxy Server
 * 
 * A robust Express proxy that forwards XML requests to TallyPrime on port 9000
 * while enforcing:
 * 1. Single-flight sequential request queue (prevents Tally c0000005 Memory Access Violation crashes from concurrent requests).
 * 2. Connection: close (prevents hanging persistent sockets when companies are opened or closed in Tally).
 * 3. 40ms breathing delay between requests for Tally's single-threaded C++ engine.
 * 4. Full CORS support for web browsers.
 */

import express from 'express';
import cors from 'cors';

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '3001', 10);
const TALLY_HOST = process.env.TALLY_HOST || 'localhost';
const TALLY_PORT = parseInt(process.env.TALLY_PORT || '9000', 10);
const TALLY_URL = `http://${TALLY_HOST}:${TALLY_PORT}`;

const app = express();

// Enable CORS for all origins
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
}));

// Parse request body as raw text (XML)
app.use(express.text({ type: '*/*', limit: '50mb' }));

// Sequential queue to guarantee Tally receives ONLY 1 request at a time
let requestQueue = Promise.resolve();

function runSequentially(task) {
    const result = requestQueue.then(async () => {
        try {
            return await task();
        } finally {
            // Brief 40ms breathing gap between requests allows Tally's engine
            // to flush file buffers and avoid memory access conflicts
            await new Promise(resolve => setTimeout(resolve, 40));
        }
    });
    // Keep queue chain alive even if a task rejects
    requestQueue = result.catch(() => {});
    return result;
}

// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        proxy: `http://localhost:${PROXY_PORT}`,
        tallyTarget: TALLY_URL,
        timestamp: new Date().toISOString(),
    });
});

// Forward POST requests to Tally sequentially with Connection: close
app.post(['/', '/tally'], (req, res) => {
    runSequentially(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);

        try {
            const response = await fetch(TALLY_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml',
                    'Connection': 'close', // Do not hold persistent Keep-Alive socket in Tally
                },
                body: req.body,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.error(`[PROXY] Tally returned HTTP ${response.status}`);
                return res.status(response.status).send(`Tally error: ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || 'text/xml';
            const data = await response.text();

            res.set('Content-Type', contentType);
            res.send(data);

            const size = Buffer.byteLength(data, 'utf-8');
            const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
            console.log(`[PROXY] ✓ ${req.method} → Tally | Response: ${sizeStr}`);
        } catch (error) {
            clearTimeout(timeoutId);
            console.error(`[PROXY] ✗ Error forwarding to Tally:`, error.message);

            if (error.name === 'AbortError') {
                return res.status(504).json({
                    error: 'Tally request timed out',
                    detail: 'TallyPrime took too long to respond. It may be showing a modal or busy.',
                    tallyUrl: TALLY_URL,
                });
            }

            if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
                return res.status(502).json({
                    error: 'Cannot connect to TallyPrime',
                    detail: `Failed to reach ${TALLY_URL}. Is TallyPrime running?`,
                    tallyUrl: TALLY_URL,
                });
            }

            res.status(500).json({
                error: 'Proxy internal error',
                detail: error.message,
            });
        }
    });
});

// GET request handler
app.get('/', (_req, res) => {
    res.json({
        service: 'Tally CORS Proxy',
        status: 'running',
        queueMode: 'sequential-safe',
        usage: 'Send POST requests with XML body to this URL',
        tallyTarget: TALLY_URL,
        healthEndpoint: '/health',
    });
});

app.listen(PROXY_PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║         🔌 Tally CORS Proxy Server (Safe Queue)  ║');
    console.log('  ╠══════════════════════════════════════════════════╣');
    console.log(`  ║  Proxy:  http://localhost:${PROXY_PORT}                  ║`);
    console.log(`  ║  Tally:  ${TALLY_URL}                     ║`);
    console.log('  ║  Mode:   Single-Flight Sequential Queue          ║');
    console.log('  ║                                                  ║');
    console.log('  ║  Set Tally URL in portal to:                     ║');
    console.log(`  ║  → http://localhost:${PROXY_PORT}                        ║`);
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
});
