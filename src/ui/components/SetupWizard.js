/**
 * Setup Wizard Component - Ink-based interactive setup
 */

import React, { useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../themes/semantic-tokens.js';
import { CLAUDE_MODELS, getClaude4Models, getClaude3Models, DEFAULT_CLAUDE_MODEL } from '../../config/claude_models.js';
import { OPENAI_MODELS, getGPT5Models, DEFAULT_OPENAI_MODEL } from '../../config/openai_models.js';

const STEPS = {
    PROVIDER: 'provider',
    OPENAI_KEY: 'openai_key',
    OPENAI_MODEL: 'openai_model',
    OPENAI_EFFORT: 'openai_effort',
    ANTHROPIC_KEY: 'anthropic_key',
    ANTHROPIC_MODEL: 'anthropic_model'
};

export function SetupWizard({ onComplete, onCancel }) {
    const [step, setStep] = useState(STEPS.PROVIDER);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [textInput, setTextInput] = useState('');

    // settings를 ref로 관리하여 stale closure 문제 방지
    const settingsRef = useRef({
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: '',
        OPENAI_MODEL: DEFAULT_OPENAI_MODEL,
        OPENAI_REASONING_EFFORT: 'medium',
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_MODEL: DEFAULT_CLAUDE_MODEL
    });

    // 현재 스텝이 텍스트 입력인지 선택지인지 판단
    const isTextInputStep = step === STEPS.OPENAI_KEY || step === STEPS.ANTHROPIC_KEY;

    const completeSetup = () => {
        if (onComplete) {
            // ref의 현재 값을 복사해서 전달
            onComplete({ ...settingsRef.current });
        }
    };

    const handleStepComplete = () => {
        switch (step) {
            case STEPS.PROVIDER:
                if (selectedIndex === 0) {
                    settingsRef.current.AI_PROVIDER = 'openai';
                    setStep(STEPS.OPENAI_KEY);
                } else {
                    settingsRef.current.AI_PROVIDER = 'anthropic';
                    setStep(STEPS.ANTHROPIC_KEY);
                }
                setSelectedIndex(0);
                break;

            case STEPS.OPENAI_KEY:
                if (!textInput.trim()) {
                    return;
                }
                settingsRef.current.OPENAI_API_KEY = textInput.trim();
                setStep(STEPS.OPENAI_MODEL);
                setTextInput('');
                setSelectedIndex(0);
                break;

            case STEPS.OPENAI_MODEL:
                const models = getGPT5Models();
                const selectedModel = models[selectedIndex];
                settingsRef.current.OPENAI_MODEL = selectedModel;

                // gpt-5 모델은 모두 reasoning effort 설정 필요
                setStep(STEPS.OPENAI_EFFORT);
                setSelectedIndex(2); // default to 'medium'
                break;

            case STEPS.OPENAI_EFFORT:
                const efforts = ['minimal', 'low', 'medium', 'high'];
                settingsRef.current.OPENAI_REASONING_EFFORT = efforts[selectedIndex];
                // 완료
                completeSetup();
                break;

            case STEPS.ANTHROPIC_KEY:
                if (!textInput.trim()) {
                    return;
                }
                settingsRef.current.ANTHROPIC_API_KEY = textInput.trim();
                setStep(STEPS.ANTHROPIC_MODEL);
                setTextInput('');
                setSelectedIndex(0);
                break;

            case STEPS.ANTHROPIC_MODEL:
                // 중앙 설정에서 모든 Claude 모델 목록 가져오기
                const anthropicModels = [...getClaude4Models(), ...getClaude3Models()];
                settingsRef.current.ANTHROPIC_MODEL = anthropicModels[selectedIndex];
                // 완료
                completeSetup();
                break;
        }
    };

    // Use Ink's useInput hook
    useInput((input, key) => {
        // Handle Ctrl+C to cancel
        if (key.ctrl && input === 'c') {
            if (onCancel) {
                onCancel();
            }
            return;
        }

        // Handle enter/return
        if (key.return) {
            handleStepComplete();
            return;
        }

        // Text input steps
        if (isTextInputStep) {
            if (key.backspace || key.delete) {
                setTextInput(prev => prev.slice(0, -1));
                return;
            }

            if (input && !key.ctrl && !key.meta) {
                setTextInput(prev => prev + input);
            }
            return;
        }

        // Selection steps - handle arrow keys
        if (key.upArrow) {
            setSelectedIndex(prev => {
                const maxIndex = getMaxIndexForStep(step);
                return (prev - 1 + maxIndex + 1) % (maxIndex + 1);
            });
        } else if (key.downArrow) {
            setSelectedIndex(prev => {
                const maxIndex = getMaxIndexForStep(step);
                return (prev + 1) % (maxIndex + 1);
            });
        }
    });

    const getMaxIndexForStep = (currentStep) => {
        switch (currentStep) {
            case STEPS.PROVIDER:
                return 1; // 2 options
            case STEPS.OPENAI_MODEL:
                return getGPT5Models().length - 1;
            case STEPS.OPENAI_EFFORT:
                return 3; // 4 options
            case STEPS.ANTHROPIC_MODEL:
                return [...getClaude4Models(), ...getClaude3Models()].length - 1;
            default:
                return 0;
        }
    };

    const renderOptions = (options) => {
        return React.createElement(Box, { flexDirection: 'column' },
            options.map((option, index) => {
                const prefix = index === selectedIndex ? '› ' : '  ';
                const fullText = prefix + option;
                return React.createElement(Text, {
                    key: `opt-${index}`,
                    color: index === selectedIndex ? 'cyan' : 'white',
                    bold: index === selectedIndex
                }, fullText);
            })
        );
    };

    const renderStep = () => {
        switch (step) {
            case STEPS.PROVIDER:
                return React.createElement(Box, { flexDirection: 'column' },
                    React.createElement(Text, { bold: true, color: theme.text.accent }, '1. Choose AI Provider:'),
                    React.createElement(Text, null),
                    renderOptions([
                        'OpenAI (GPT-5, GPT-4, o1 series)',
                        'Anthropic (Claude series)'
                    ]),
                    React.createElement(Text, null),
                    React.createElement(Text, { dimColor: true }, '↑↓: Navigate  Enter: Confirm')
                );

            case STEPS.OPENAI_KEY:
                return React.createElement(Box, { flexDirection: 'column' },
                    React.createElement(Text, { bold: true, color: theme.text.accent }, '2. OpenAI API Key:'),
                    React.createElement(Text, { color: theme.text.secondary }, '   Get your API key from: https://platform.openai.com/account/api-keys'),
                    React.createElement(Text, null),
                    React.createElement(Box, {
                        borderStyle: 'round',
                        borderColor: theme.border.focused,
                        paddingX: 1
                    },
                        React.createElement(Text, null, textInput ? '*'.repeat(textInput.length) : ' ')
                    ),
                    React.createElement(Text, null),
                    React.createElement(Text, { dimColor: true }, 'Type your API key and press Enter')
                );

            case STEPS.OPENAI_MODEL:
                return React.createElement(Box, { flexDirection: 'column' },
                    React.createElement(Text, { bold: true, color: theme.text.accent }, '3. Choose Model:'),
                    React.createElement(Text, null),
                    renderOptions(
                        getGPT5Models().map(modelId => {
                            const model = OPENAI_MODELS[modelId];
                            return `${modelId} (${model.name})`;
                        })
                    ),
                    React.createElement(Text, null),
                    React.createElement(Text, { dimColor: true }, '↑↓: Navigate  Enter: Confirm')
                );

            case STEPS.OPENAI_EFFORT:
                return React.createElement(Box, { flexDirection: 'column' },
                    React.createElement(Text, { bold: true, color: theme.text.accent }, '4. Reasoning Effort:'),
                    React.createElement(Text, null),
                    renderOptions([
                        'minimal (Fastest)',
                        'low',
                        'medium (Recommended)',
                        'high (Most thorough)'
                    ]),
                    React.createElement(Text, null),
                    React.createElement(Text, { dimColor: true }, '↑↓: Navigate  Enter: Confirm')
                );

            case STEPS.ANTHROPIC_KEY:
                return React.createElement(Box, { flexDirection: 'column' },
                    React.createElement(Text, { bold: true, color: theme.text.accent }, '2. Anthropic API Key:'),
                    React.createElement(Text, { color: theme.text.secondary }, '   Get your API key from: https://console.anthropic.com/settings/keys'),
                    React.createElement(Text, null),
                    React.createElement(Box, {
                        borderStyle: 'round',
                        borderColor: theme.border.focused,
                        paddingX: 1
                    },
                        React.createElement(Text, null, textInput ? '*'.repeat(textInput.length) : ' ')
                    ),
                    React.createElement(Text, null),
                    React.createElement(Text, { dimColor: true }, 'Type your API key and press Enter')
                );

            case STEPS.ANTHROPIC_MODEL:
                return React.createElement(Box, { flexDirection: 'column' },
                    React.createElement(Text, { bold: true, color: theme.text.accent }, '3. Choose Model:'),
                    React.createElement(Text, null),
                    renderOptions(
                        [...getClaude4Models(), ...getClaude3Models()].map(modelId => {
                            const model = CLAUDE_MODELS[modelId];
                            return `${modelId} (${model.name})`;
                        })
                    ),
                    React.createElement(Text, null),
                    React.createElement(Text, { dimColor: true }, '↑↓: Navigate  Enter: Confirm')
                );

            default:
                return null;
        }
    };

    return React.createElement(Box, { flexDirection: 'column', padding: 1 },
        React.createElement(Text, { bold: true, color: theme.status.success }, '🔧 AIEXEcode Setup - Configure your AI provider'),
        React.createElement(Text, null),
        renderStep()
    );
}
