import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
function consolelog() { }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get home directory
function getHomeDirectory() {
    return process.env.HOME || process.env.USERPROFILE || '/home/ubuntu';
}

// Get AI Agent config directory
const CONFIG_DIR = path.join(getHomeDirectory(), '.aiexe');
const PAYLOAD_LOG_DIR = path.join(CONFIG_DIR, 'payload_log');

// Load AI Agent settings
function loadAIAgentSettings() {
    try {
        const settingsPath = path.join(CONFIG_DIR, 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            consolelog('✅ AI Agent settings loaded from ~/.aiexe/settings.json');
            return settings;
        }
    } catch (error) {
        consolelog('⚠️  Could not load AI Agent settings:', error.message);
    }
    return {};
}

const aiAgentSettings = loadAIAgentSettings();

// Initialize OpenAI client (check multiple sources for API key)
let openai = null;
const openaiApiKey = process.env.OPENAI_API_KEY || aiAgentSettings.OPENAI_API_KEY;

if (openaiApiKey) {
    openai = new OpenAI({
        apiKey: openaiApiKey,
    });
    consolelog('✅ OpenAI client initialized');
} else {
    consolelog('⚠️  OpenAI API key not found - API testing will return mock responses');
    consolelog('   Checked: process.env.OPENAI_API_KEY and ~/.aiexe/settings.json');
}


// ID generation function
function generateId() {
    return Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
}

function startWebServer(port = 3300) {
    const app = express();

    // Parse JSON bodies (increase limit for large AI request/response payloads)
    app.use(express.json({ limit: '50mb' }));

    // Serve static files from Next.js build
    const outPath = path.join(__dirname, 'out');
    const isProduction = true; // Always production mode

    // Serve all static files from 'out' directory (Next.js export output)
    if (fs.existsSync(outPath)) {
        app.use(express.static(outPath));
        consolelog(`📁 Serving Next.js static files from: ${outPath}`);
    } else {
        consolelog(`⚠️  Warning: 'out' directory not found at ${outPath}`);
        consolelog(`   Please run: npm run build`);
    }

    // Helper function to parse log filename
    function parseLogFileName(fileName) {
        const match = fileName.match(/^(\d{4}-\d{2}-\d{2})_(\d{9})_(.+)_(REQ|RES)\.json$/);

        if (match) {
            const [, date, timestamp, component, type] = match;
            const hour = timestamp.substring(0, 2);
            const minute = timestamp.substring(2, 4);
            const second = timestamp.substring(4, 6);
            const millisecond = timestamp.substring(6, 9);

            return {
                date,
                timestamp,
                component,
                type,
                datetime: new Date(`${date}T${hour}:${minute}:${second}.${millisecond}Z`)
            };
        }

        return null;
    }

    // Helper function to create workflow groups (improved version from payload_viewer_old)
    function createWorkflowGroups(files) {
        const workflows = new Map();

        files.forEach(file => {
            if (!file.parsedInfo) return;

            const { date, timestamp } = file.parsedInfo;
            const workflowKey = `${date}_${timestamp.substring(0, 6)}`; // Group by date and time up to seconds

            if (!workflows.has(workflowKey)) {
                workflows.set(workflowKey, {
                    id: workflowKey,
                    date: date,
                    startTime: file.parsedInfo.datetime,
                    files: [],
                    components: new Set(),
                    status: 'unknown'
                });
            }

            const workflow = workflows.get(workflowKey);
            workflow.files.push(file);
            workflow.components.add(file.parsedInfo.component);

            // Determine workflow status
            if (workflow.files.some(f => f.parsedInfo.component === 'verifier' && f.parsedInfo.type === 'RES')) {
                workflow.status = 'completed';
            } else if (workflow.files.length > 0) {
                workflow.status = 'in_progress';
            }
        });

        // Convert Map to array and sort by time
        return Array.from(workflows.values())
            .sort((a, b) => b.startTime - a.startTime)
            .map(workflow => ({
                ...workflow,
                components: Array.from(workflow.components),
                duration: calculateWorkflowDuration(workflow.files),
                startTime: workflow.startTime,
                endTime: workflow.files.length > 0 ?
                    new Date(Math.max(...workflow.files.map(f => f.parsedInfo ? new Date(f.parsedInfo.datetime).getTime() : 0))).toISOString() :
                    workflow.startTime
            }));
    }

    // Helper function to calculate workflow duration
    function calculateWorkflowDuration(files) {
        if (files.length < 2) return 0;

        const times = files
            .filter(f => f.parsedInfo)
            .map(f => new Date(f.parsedInfo.datetime))
            .sort((a, b) => a.getTime() - b.getTime());

        if (times.length < 2) return 0;

        return times[times.length - 1].getTime() - times[0].getTime();
    }

    // API routes for payload logs
    app.get('/api/logs', (req, res) => {
        try {
            const logDir = PAYLOAD_LOG_DIR;
            if (!fs.existsSync(logDir)) {
                return res.json({ files: [], workflows: [] });
            }

            const files = fs.readdirSync(logDir)
                .filter(file => file.endsWith('.json'))
                .map(file => {
                    const filePath = path.join(logDir, file);
                    const stats = fs.statSync(filePath);
                    const parsedInfo = parseLogFileName(file);

                    const fileInfo = {
                        name: file,
                        size: stats.size,
                        modified: stats.mtime.toISOString(),
                        created: stats.birthtime.toISOString(),
                        extension: path.extname(file),
                        parsedInfo: parsedInfo || undefined
                    };

                    // Convert datetime to ISO string if it exists
                    if (fileInfo.parsedInfo && fileInfo.parsedInfo.datetime) {
                        fileInfo.parsedInfo.datetime = fileInfo.parsedInfo.datetime.toISOString();
                    }

                    return fileInfo;
                });

            // Sort files by time
            files.sort((a, b) => {
                const timeA = a.parsedInfo?.datetime ? new Date(a.parsedInfo.datetime) : new Date(a.created);
                const timeB = b.parsedInfo?.datetime ? new Date(b.parsedInfo.datetime) : new Date(b.created);
                return timeB.getTime() - timeA.getTime();
            });

            const workflows = createWorkflowGroups(files);

            res.json({ files, workflows });
        } catch (error) {
            consolelog('Error reading log files:', error);
            res.status(500).json({ error: 'Failed to read log files' });
        }
    });

    app.get('/api/logs/:filename', (req, res) => {
        try {
            const filename = decodeURIComponent(req.params.filename);
            const filePath = path.join(PAYLOAD_LOG_DIR, filename);

            // Security check
            if (!filePath.startsWith(PAYLOAD_LOG_DIR)) {
                return res.status(400).json({ error: 'Invalid file path' });
            }

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found' });
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            res.json(data);
        } catch (error) {
            consolelog('Error reading file:', error);
            if (error instanceof SyntaxError) {
                res.status(400).json({ error: 'Invalid JSON file' });
            } else {
                res.status(500).json({ error: 'Failed to read file' });
            }
        }
    });

    app.put('/api/logs/:filename', (req, res) => {
        try {
            const filename = decodeURIComponent(req.params.filename);
            const filePath = path.join(PAYLOAD_LOG_DIR, filename);

            // Security check
            if (!filePath.startsWith(PAYLOAD_LOG_DIR)) {
                return res.status(400).json({ error: 'Invalid file path' });
            }

            const body = JSON.stringify(req.body, null, 2);

            // Backup original file
            const backupPath = `${filePath}.backup.${Date.now()}`;
            if (fs.existsSync(filePath)) {
                fs.copyFileSync(filePath, backupPath);
            }

            // Save file
            fs.writeFileSync(filePath, body, 'utf-8');

            res.json({ success: true });
        } catch (error) {
            consolelog('Error saving file:', error);
            res.status(500).json({ error: 'Failed to save file' });
        }
    });

    // OpenAI API test endpoint
    app.post('/api/test-openai', async (req, res) => {
        try {
            const payload = req.body;

            // Actual OpenAI API call (if API key is available)
            if (openai && openaiApiKey) {
                // Use OpenAI responses.create (pass payload as is)
                let response = await openai.responses.create(payload);
                let allToolOutputs = [];
                let currentPayload = payload;
                let allResponses = [response];

                // Handle function_calls iteratively
                let maxIterations = 10; // Prevent infinite loops
                let iteration = 0;
                let hasProcessedFunctionCalls = false;

                // Process function_calls while they exist
                while (iteration < maxIterations) {
                    // Check response structure (response or response.data)
                    const responseData = response.data || response;

                    if (!responseData || !responseData.output || !Array.isArray(responseData.output)) {
                        break;
                    }

                    const functionCalls = responseData.output.filter(item => item.type === 'function_call');

                    if (functionCalls.length === 0) {
                        if (hasProcessedFunctionCalls) {
                            break; // No more function_calls to execute
                        } else {
                            break; // No function_calls in first response
                        }
                    }

                    hasProcessedFunctionCalls = true;
                    const currentIterationOutputs = [];

                    // Execute each function_call sequentially
                    for (const functionCall of functionCalls) {
                        try {
                            // Mock function execution for now
                            const toolOutput = {
                                tool_call_id: functionCall.call_id || functionCall.id || generateId(),
                                output: JSON.stringify({
                                    result: "Mock function execution result",
                                    status: "success",
                                    timestamp: new Date().toISOString()
                                })
                            };
                            currentIterationOutputs.push(toolOutput);
                            allToolOutputs.push(toolOutput);
                        } catch (error) {
                            consolelog(`Function call execution failed: ${error.message}`);
                            const errorOutput = {
                                tool_call_id: functionCall.call_id || functionCall.id || generateId(),
                                output: JSON.stringify({
                                    error: `Execution failed: ${error.message}`,
                                    status: "failed",
                                    timestamp: new Date().toISOString()
                                })
                            };
                            currentIterationOutputs.push(errorOutput);
                            allToolOutputs.push(errorOutput);
                        }
                    }

                    // Continuation request with tool_outputs
                    if (currentIterationOutputs.length > 0) {
                        currentPayload = {
                            ...payload,
                            tool_outputs: [...allToolOutputs],
                            response_id: response?.id || responseData?.id,
                            messages: [
                                ...(payload.messages || []),
                            ]
                        };

                        try {
                            response = await openai.responses.create(currentPayload);
                            allResponses.push(response);
                            iteration++;
                        } catch (error) {
                            consolelog(`Continuation request failed: ${error.message}`);
                            break;
                        }
                    } else {
                        break;
                    }
                }

                // Final response composition
                const finalResponse = allResponses[0];
                const finalResponseData = finalResponse.data || finalResponse;

                res.json({
                    success: true,
                    provider: 'openai',
                    status: 200,
                    data: {
                        ...finalResponseData,
                        provider: 'openai',
                        tool_outputs: allToolOutputs,
                        all_responses: allResponses,
                        iterations_executed: iteration,
                        function_calls_processed: allToolOutputs.length
                    },
                    tool_outputs: allToolOutputs,
                    iterations: iteration,
                    originalPayload: payload,
                    convertedPayload: payload
                });
            } else {
                // Mock response when API key is not available
                res.json({
                    success: false,
                    provider: 'openai',
                    error: 'OPENAI_API_KEY environment variable not set',
                    mockResponse: {
                        taskName: "api_test_RES",
                        timestamp: new Date().toISOString(),
                        data: {
                            id: `resp_${generateId()}`,
                            object: "response",
                            created_at: Math.floor(Date.now() / 1000),
                            status: "completed",
                            model: payload.model || 'gpt-5-mini',
                            provider: 'openai',
                            output: [{
                                id: `msg_${generateId()}`,
                                type: "message",
                                status: "completed",
                                content: [{
                                    type: "output_text",
                                    text: 'This is a mock response. Set OPENAI_API_KEY to get real responses.'
                                }],
                                role: "assistant"
                            }],
                            usage: {
                                input_tokens: 10,
                                output_tokens: 15,
                                total_tokens: 25
                            }
                        }
                    },
                    originalPayload: payload
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                provider: 'openai',
                error: error.message,
                originalPayload: req.body
            });
        }
    });


    // Health check endpoint
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Fallback to index.html for SPA routing (production mode)
    app.use((req, res) => {
        const indexPath = path.join(__dirname, 'out', 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).send(`
                <html>
                    <head>
                        <title>Frontend Not Built</title>
                        <style>
                            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                            h1 { color: #e74c3c; }
                            pre { background: #f8f8f8; padding: 15px; border-radius: 4px; overflow-x: auto; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>⚠️ Frontend Not Built</h1>
                            <p>The Next.js frontend has not been built yet.</p>

                            <h2>To build the frontend:</h2>
                            <pre>cd payload_viewer && npm install && npm run build</pre>

                            <h2>Or use the start script:</h2>
                            <pre>cd payload_viewer && ./start.sh</pre>

                            <p>After building, refresh this page.</p>
                        </div>
                    </body>
                </html>
            `);
        }
    });

    return new Promise((resolve, reject) => {
        try {
            const server = app.listen(port, () => {
                console.log(`🌐 Payload viewer available at: http://localhost:${port}`);
                resolve(server);
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`⚠️  Port ${port} is already in use. Trying port ${port + 1}...`);
                    server.close();
                    // Try next port
                    const nextServer = app.listen(port + 1, () => {
                        console.log(`🌐 Payload viewer available at: http://localhost:${port + 1}`);
                        resolve(nextServer);
                    });
                } else {
                    reject(err);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const port = parseInt(process.argv[2], 10) || 3300;
    startWebServer(port).catch(err => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });
}

export { startWebServer };