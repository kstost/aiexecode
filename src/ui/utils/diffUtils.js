/**
 * diffUtils - Shared utilities for preparing diff data
 */

/**
 * Prepare diff data for edit_file_replace operation
 * This function extracts the logic from ToolApprovalPrompt to ensure
 * consistent diff display in both approval prompt and history view
 *
 * @param {string} oldString - The string to be replaced
 * @param {string} newString - The replacement string
 * @param {string} fileContent - The full file content
 * @returns {Object} Diff data object with oldContent, newContent, context, line numbers, or error
 */
export function prepareEditReplaceDiff(oldString, newString, fileContent) {
    try {
        if (!fileContent) {
            return {
                error: 'File not read yet or empty'
            };
        }

        // Find old_string in file content
        const index = fileContent.indexOf(oldString);

        if (index === -1) {
            return {
                error: 'old_string not found in file'
            };
        }

        // Calculate line numbers
        const beforeMatch = fileContent.substring(0, index);
        const startLine = beforeMatch.split('\n').length;

        // Calculate actual line count (handle trailing newline)
        const oldStringSplit = oldString.split('\n');
        const oldStringLines = oldString.endsWith('\n')
            ? oldStringSplit.length - 1
            : oldStringSplit.length;
        const endLine = startLine + oldStringLines - 1;

        // Split file into lines
        const lines = fileContent.split('\n');
        const actualLines = fileContent === '' ? [] :
            (fileContent.endsWith('\n') ? lines.slice(0, -1) : lines);

        // For partial line replacements, show the full line context
        // For multi-line replacements, use the matched content directly
        let fullOldContent, fullNewContent;

        if (oldStringLines === 1 && !oldString.includes('\n')) {
            // Single line partial replacement - extract and show full lines
            const affectedLines = actualLines.slice(startLine - 1, endLine);
            fullOldContent = affectedLines.join('\n');
            // Replace old_string with new_string in each affected line
            fullNewContent = affectedLines.map(line =>
                line.replace(oldString, newString)
            ).join('\n');
        } else {
            // Multi-line replacement - use the matched content directly
            fullOldContent = oldString.replace(/\n$/, '');
            fullNewContent = newString.replace(/\n$/, '');
        }

        // Extract context (2 lines before and after)
        const contextLines = 2;
        const contextStartIdx = Math.max(0, startLine - 1 - contextLines);
        const contextEndIdx = Math.min(actualLines.length, endLine + contextLines);

        const ctxBefore = actualLines.slice(contextStartIdx, startLine - 1);
        const ctxAfter = actualLines.slice(endLine, contextEndIdx);

        return {
            startLine: startLine,
            endLine: endLine,
            oldContent: fullOldContent,
            newContent: fullNewContent,
            contextBefore: ctxBefore,
            contextAfter: ctxAfter,
            contextStartLine: contextStartIdx + 1
        };
    } catch (error) {
        return {
            error: error.message
        };
    }
}
