/**
 * Hook to handle terminal resize events
 * Clears the screen on resize to prevent rendering artifacts
 */

import { useEffect } from 'react';
import { useStdout } from 'ink';

export function useTerminalResize(onResize) {
    const { stdout } = useStdout();

    useEffect(() => {
        if (!stdout || typeof stdout.on !== 'function') {
            return;
        }

        const handleResize = () => {
            // Clear the screen to prevent artifacts
            if (stdout.write && typeof stdout.write === 'function') {
                // ANSI escape code to clear screen and reset cursor
                stdout.write('\x1Bc');
            }

            if (onResize) {
                onResize();
            }
        };

        stdout.on('resize', handleResize);

        return () => {
            if (stdout.off && typeof stdout.off === 'function') {
                stdout.off('resize', handleResize);
            } else if (stdout.removeListener && typeof stdout.removeListener === 'function') {
                stdout.removeListener('resize', handleResize);
            }
        };
    }, [stdout, onResize]);
}
