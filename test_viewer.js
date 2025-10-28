#!/usr/bin/env node

/**
 * Test viewer for FileDiffViewer component
 * Reads JSON from stdin and renders the diff
 *
 * Input JSON format:
 * {
 *   "file_path": "/path/to/file.txt",
 *   "file_content": "full file content",
 *   "old_string": "original content",
 *   "new_string": "new content"
 * }
 */

import React from 'react';
import { render } from 'ink';
import { FileDiffViewer } from './src/frontend/components/FileDiffViewer.js';
import { prepareEditReplaceDiff } from './src/frontend/utils/diffUtils.js';
import fs from 'fs';

// Read JSON from stdin
let inputData = '';

if (process.stdin.isTTY) {
    console.error('Error: This program requires JSON input via stdin');
    console.error('Usage: echo \'{"file_path":"...","old_string":"...","new_string":"..."}\' | node test_viewer.js');
    process.exit(1);
}

process.stdin.setEncoding('utf-8');

process.stdin.on('data', (chunk) => {
    inputData += chunk;
});

process.stdin.on('end', () => {
    try {
        // Parse JSON input
        const input = JSON.parse(inputData);

        // Validate required fields
        if (!input.file_path || input.old_string === undefined || input.new_string === undefined) {
            console.error('Error: JSON must contain file_path, old_string, and new_string');
            process.exit(1);
        }

        // Get file content from JSON or read from file
        let fileContent;
        if (input.file_content !== undefined) {
            fileContent = input.file_content;
        } else {
            try {
                fileContent = fs.readFileSync(input.file_path, 'utf-8');
            } catch (error) {
                console.error(`Error reading file: ${error.message}`);
                process.exit(1);
            }
        }

        // Prepare diff using existing utility
        const diffData = prepareEditReplaceDiff(input.old_string, input.new_string, fileContent, false);

        // Check for errors
        if (diffData.error) {
            console.error(`Error: ${diffData.error}`);
            process.exit(1);
        }

        // Display old_string and new_string first
        console.log('=== Old String ===');
        console.log(input.old_string);
        console.log('');
        console.log('=== New String ===');
        console.log(input.new_string);
        console.log('');

        // Display original content with line numbers
        console.log('=== Original Content ===');
        const lines = fileContent.split('\n');
        // Remove trailing empty line if file ends with newline
        const displayLines = (lines.length > 0 && lines[lines.length - 1] === '') ? lines.slice(0, -1) : lines;
        displayLines.forEach((line, index) => {
            const lineNum = String(index + 1).padStart(4, ' ');
            console.log(`${lineNum}  ${line}`);
        });
        console.log('');
        console.log('=== Diff View ===');

        // Create wrapper component that auto-exits after rendering
        const AutoExitWrapper = () => {
            const [rendered, setRendered] = React.useState(false);

            React.useEffect(() => {
                // Mark as rendered after first render
                if (!rendered) {
                    setRendered(true);
                    // Use setImmediate to ensure all output is flushed
                    setImmediate(() => {
                        process.exit(0);
                    });
                }
            }, [rendered]);

            return React.createElement(FileDiffViewer, {
                filePath: input.file_path,
                startLine: diffData.startLine,
                endLine: diffData.endLine,
                oldContent: diffData.oldContent,
                newContent: diffData.newContent,
                contextBefore: diffData.contextBefore,
                contextAfter: diffData.contextAfter,
                contextStartLine: diffData.contextStartLine,
                showHeader: false,
                showBorder: false
            });
        };

        // Render to terminal
        render(React.createElement(AutoExitWrapper));

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
});