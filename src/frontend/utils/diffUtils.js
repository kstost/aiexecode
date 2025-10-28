/**
 * diffUtils - Shared utilities for preparing diff data
 */

import { createDebugLogger } from '../../util/debug_log.js';

const debugLog = createDebugLogger('ui_utils.log', 'diffUtils');

/**
 * Prepare diff data for edit_file_replace operation
 * This function extracts the logic from ToolApprovalPrompt to ensure
 * consistent diff display in both approval prompt and history view
 *
 * @param {string} oldString - The string to be replaced
 * @param {string} newString - The replacement string
 * @param {string} fileContent - The full file content
 * @param {boolean} replaceAll - If true, replace all occurrences
 * @returns {Object} Diff data object with oldContent, newContent, context, line numbers, or error
 */
export function prepareEditReplaceDiff(oldString, newString, fileContent, replaceAll = false) {
    debugLog('========== prepareEditReplaceDiff START ==========');
    debugLog(`oldString length: ${oldString?.length || 0}`);
    debugLog(`oldString preview: ${JSON.stringify(oldString?.substring(0, 100))}`);
    debugLog(`newString length: ${newString?.length || 0}`);
    debugLog(`newString preview: ${JSON.stringify(newString?.substring(0, 100))}`);
    debugLog(`fileContent length: ${fileContent?.length || 0}`);
    debugLog(`replaceAll: ${replaceAll}`);

    try {
        if (!fileContent) {
            debugLog('ERROR: fileContent is empty or null');
            debugLog('========== prepareEditReplaceDiff END (ERROR) ==========');
            return {
                error: 'File not read yet or empty'
            };
        }

        // Find old_string in file content
        debugLog('Searching for old_string in file content...');
        const index = fileContent.indexOf(oldString);
        debugLog(`old_string found at index: ${index}`);

        if (index === -1) {
            debugLog('ERROR: old_string not found in file');
            debugLog('========== prepareEditReplaceDiff END (ERROR) ==========');
            return {
                error: 'old_string not found in file'
            };
        }

        // Split file into lines
        debugLog('Splitting file content into lines...');
        const lines = fileContent.split('\n');
        const actualLines = fileContent === '' ? [] :
            (fileContent.endsWith('\n') ? lines.slice(0, -1) : lines);
        debugLog(`Total lines: ${lines.length}, Actual lines: ${actualLines.length}`);

        // If replaceAll is true, find all occurrences and show full file diff
        if (replaceAll) {
            debugLog('========== REPLACE_ALL MODE ==========');
            // Find all occurrences in the file content
            debugLog('Finding all occurrences of old_string...');
            const occurrences = [];
            let searchIndex = 0;
            while (true) {
                const foundIndex = fileContent.indexOf(oldString, searchIndex);
                if (foundIndex === -1) break;
                occurrences.push(foundIndex);
                debugLog(`  Found occurrence #${occurrences.length} at index ${foundIndex}`);
                searchIndex = foundIndex + 1;
            }
            debugLog(`Total occurrences found: ${occurrences.length}`);

            if (occurrences.length === 0) {
                debugLog('ERROR: No occurrences found in replaceAll mode');
                debugLog('========== prepareEditReplaceDiff END (ERROR) ==========');
                return {
                    error: 'old_string not found in file'
                };
            }

            // Calculate affected line ranges for all occurrences
            debugLog('Calculating affected line ranges for all occurrences...');
            const affectedLineRanges = occurrences.map((idx, i) => {
                const beforeMatch = fileContent.substring(0, idx);
                const startLine = beforeMatch.split('\n').length;

                const oldStringSplit = oldString.split('\n');
                const oldStringLines = oldString.endsWith('\n')
                    ? oldStringSplit.length - 1
                    : oldStringSplit.length;
                const endLine = startLine + oldStringLines - 1;

                debugLog(`  Occurrence #${i + 1}: lines ${startLine}-${endLine}`);
                return { startLine, endLine };
            });

            // Find the overall range
            const firstAffectedLine = Math.min(...affectedLineRanges.map(r => r.startLine));
            const lastAffectedLine = Math.max(...affectedLineRanges.map(r => r.endLine));
            debugLog(`Overall affected range: lines ${firstAffectedLine}-${lastAffectedLine}`);

            // Create old and new content for the affected range
            const startLine = firstAffectedLine;
            const endLine = lastAffectedLine;

            debugLog(`Extracting affected lines from actualLines[${startLine - 1}:${endLine}]...`);
            const affectedLines = actualLines.slice(startLine - 1, endLine);
            const fullOldContent = affectedLines.join('\n');
            debugLog(`fullOldContent length: ${fullOldContent.length} bytes, lines: ${affectedLines.length}`);

            // Replace ALL occurrences in the entire file content
            debugLog('Replacing ALL occurrences in file content...');
            const replacedContent = fileContent.split(oldString).join(newString);
            const replacedLines = replacedContent.split('\n');
            const replacedActualLines = replacedContent === '' ? [] :
                (replacedContent.endsWith('\n') ? replacedLines.slice(0, -1) : replacedLines);
            debugLog(`Replaced content total lines: ${replacedActualLines.length}`);

            // Calculate the new end line based on how many lines the replacement spans
            debugLog('Calculating new end line...');
            const oldLineCount = endLine - startLine + 1;
            const newLineCount = affectedLines.join('\n').split(oldString).join(newString).split('\n').length;
            const newEndLine = startLine + newLineCount - 1;
            debugLog(`  oldLineCount: ${oldLineCount}`);
            debugLog(`  newLineCount: ${newLineCount}`);
            debugLog(`  newEndLine: ${newEndLine}`);

            debugLog(`Extracting fullNewContent from replacedActualLines[${startLine - 1}:${newEndLine}]...`);
            const fullNewContent = replacedActualLines.slice(startLine - 1, newEndLine).join('\n');
            debugLog(`fullNewContent length: ${fullNewContent.length} bytes`);

            // Extract context (2 lines before and after)
            const contextLines = 2;
            const contextStartIdx = Math.max(0, startLine - 1 - contextLines);
            const contextEndIdx = Math.min(actualLines.length, endLine + contextLines);
            debugLog(`Context: before[${contextStartIdx}:${startLine - 1}], after[${endLine}:${contextEndIdx}]`);

            const ctxBefore = actualLines.slice(contextStartIdx, startLine - 1);
            const ctxAfter = actualLines.slice(endLine, contextEndIdx);
            debugLog(`Context before: ${ctxBefore.length} lines, after: ${ctxAfter.length} lines`);

            const result = {
                startLine: startLine,
                endLine: endLine,
                oldContent: fullOldContent,
                newContent: fullNewContent,
                contextBefore: ctxBefore,
                contextAfter: ctxAfter,
                contextStartLine: contextStartIdx + 1
            };
            debugLog('========== prepareEditReplaceDiff END (REPLACE_ALL SUCCESS) ==========');
            return result;
        }

        // Single replacement mode (original logic)
        debugLog('========== SINGLE REPLACEMENT MODE ==========');
        // Calculate line numbers
        debugLog('Calculating line numbers...');
        const beforeMatch = fileContent.substring(0, index);
        const startLine = beforeMatch.split('\n').length;
        debugLog(`startLine: ${startLine}`);

        // Calculate actual line count (handle trailing newline)
        const oldStringSplit = oldString.split('\n');
        const oldStringLines = oldString.endsWith('\n')
            ? oldStringSplit.length - 1
            : oldStringSplit.length;
        const endLine = startLine + oldStringLines - 1;
        debugLog(`oldStringLines: ${oldStringLines}, endLine: ${endLine}`);

        // For partial line replacements, show the full line context
        // For multi-line replacements, check if it's partial or full line
        let fullOldContent, fullNewContent;

        // Extract affected lines
        debugLog(`Extracting affected lines from actualLines[${startLine - 1}:${endLine}]...`);
        const affectedLines = actualLines.slice(startLine - 1, endLine);
        fullOldContent = affectedLines.join('\n');
        debugLog(`Affected lines count: ${affectedLines.length}`);
        debugLog(`fullOldContent (from affected lines): ${JSON.stringify(fullOldContent.substring(0, 100))}`);

        // Check if oldString matches the full affected lines (full line replacement)
        // or if it's a partial replacement within those lines
        const isFullLineMatch = (fullOldContent === oldString) ||
                                (fullOldContent === oldString.replace(/\n$/, '')) ||
                                (fullOldContent + '\n' === oldString);
        debugLog(`isFullLineMatch: ${isFullLineMatch}`);

        if (isFullLineMatch) {
            // Full line replacement - use the matched content directly
            debugLog('Full line replacement mode');
            fullOldContent = oldString.replace(/\n$/, '');
            fullNewContent = newString.replace(/\n$/, '');
            debugLog(`fullOldContent length: ${fullOldContent.length}`);
            debugLog(`fullNewContent length: ${fullNewContent.length}`);
        } else {
            // Partial line replacement (single or multi-line) - replace within full lines
            debugLog('Partial line replacement mode - replacing within full lines');
            fullNewContent = fullOldContent.split(oldString).join(newString);
            debugLog(`fullOldContent length: ${fullOldContent.length}`);
            debugLog(`fullNewContent length: ${fullNewContent.length}`);
            debugLog(`fullNewContent preview: ${JSON.stringify(fullNewContent.substring(0, 100))}`);
        }

        // Extract context (2 lines before and after)
        const contextLines = 2;
        const contextStartIdx = Math.max(0, startLine - 1 - contextLines);
        const contextEndIdx = Math.min(actualLines.length, endLine + contextLines);
        debugLog(`Context: before[${contextStartIdx}:${startLine - 1}], after[${endLine}:${contextEndIdx}]`);

        const ctxBefore = actualLines.slice(contextStartIdx, startLine - 1);
        const ctxAfter = actualLines.slice(endLine, contextEndIdx);
        debugLog(`Context before: ${ctxBefore.length} lines, after: ${ctxAfter.length} lines`);

        const result = {
            startLine: startLine,
            endLine: endLine,
            oldContent: fullOldContent,
            newContent: fullNewContent,
            contextBefore: ctxBefore,
            contextAfter: ctxAfter,
            contextStartLine: contextStartIdx + 1
        };
        debugLog('========== prepareEditReplaceDiff END (SINGLE REPLACEMENT SUCCESS) ==========');
        return result;
    } catch (error) {
        debugLog(`EXCEPTION caught: ${error.message}`);
        debugLog(`Stack trace: ${error.stack}`);
        debugLog('========== prepareEditReplaceDiff END (EXCEPTION) ==========');
        return {
            error: error.message
        };
    }
}
