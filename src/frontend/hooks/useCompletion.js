/**
 * Autocompletion hook for slash commands
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export function useCompletion(buffer, commands = []) {
    const [suggestions, setSuggestions] = useState([]);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const lastTextRef = useRef('');

    useEffect(() => {
        const text = buffer.text;

        // Skip if text hasn't changed
        if (text === lastTextRef.current) {
            return;
        }
        lastTextRef.current = text;

        // Check if we should show slash command completions
        if (text.startsWith('/') && !text.includes('\n')) {
            const query = text.slice(1).toLowerCase();
            const matches = commands
                .filter(cmd => cmd.name.toLowerCase().startsWith(query))
                .map(cmd => ({
                    value: `/${cmd.name}`,
                    description: cmd.description || ''
                }));

            // Only update if suggestions actually changed
            if (JSON.stringify(matches) !== JSON.stringify(suggestions)) {
                setSuggestions(matches);
                setShowSuggestions(matches.length > 0);
                setActiveSuggestionIndex(matches.length > 0 ? 0 : -1);
            }
        } else if (showSuggestions) {
            // Only clear if we're currently showing suggestions
            setSuggestions([]);
            setShowSuggestions(false);
            setActiveSuggestionIndex(-1);
        }
    }, [buffer.text, commands, suggestions, showSuggestions]);

    const navigateUp = useCallback(() => {
        setActiveSuggestionIndex(prev =>
            prev > 0 ? prev - 1 : suggestions.length - 1
        );
    }, [suggestions.length]);

    const navigateDown = useCallback(() => {
        setActiveSuggestionIndex(prev =>
            prev < suggestions.length - 1 ? prev + 1 : 0
        );
    }, [suggestions.length]);

    const handleAutocomplete = useCallback((index) => {
        if (index >= 0 && index < suggestions.length) {
            buffer.setText(suggestions[index].value + ' ');
            // 커서를 텍스트의 가장 오른쪽으로 이동
            buffer.move('end');
            setSuggestions([]);
            setShowSuggestions(false);
            setActiveSuggestionIndex(-1);
        }
    }, [buffer, suggestions]);

    const resetCompletionState = useCallback(() => {
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
    }, []);

    return {
        suggestions,
        activeSuggestionIndex,
        showSuggestions,
        navigateUp,
        navigateDown,
        handleAutocomplete,
        resetCompletionState
    };
}
