import { uiEvents } from '../system/ui_events.js';
import { createDebugLogger } from '../util/debug_log.js';
import { theme } from '../frontend/design/themeColors.js';
import { updateCurrentTodos } from '../system/session_memory.js';

const debugLog = createDebugLogger('todo_write.log', 'todo_write');

/**
 * Todo 관리 도구
 * 현재 코딩 세션의 작업 목록을 생성하고 관리합니다.
 */

/**
 * Todo 리스트를 업데이트합니다
 * @param {Object} params - 매개변수 객체
 * @param {Array} params.todos - Todo 항목 배열
 * @returns {Promise<Object>} 결과 객체
 */
export async function todo_write({ todos }) {
    debugLog('========== todo_write START ==========');
    debugLog(`Input todos count: ${todos?.length || 0}`);

    try {
        // todos 배열 유효성 검증
        if (!Array.isArray(todos)) {
            debugLog('ERROR: todos is not an array');
            debugLog('========== todo_write ERROR END ==========');
            return {
                operation_successful: false,
                error_message: 'todos must be an array'
            };
        }

        // 각 todo 항목 검증
        for (let i = 0; i < todos.length; i++) {
            const todo = todos[i];
            debugLog(`Validating todo ${i + 1}/${todos.length}:`);
            debugLog(`  content: "${todo.content}"`);
            debugLog(`  status: "${todo.status}"`);
            debugLog(`  activeForm: "${todo.activeForm}"`);

            if (!todo.content || typeof todo.content !== 'string') {
                debugLog(`ERROR: todo ${i + 1} has invalid content`);
                return {
                    operation_successful: false,
                    error_message: `Todo ${i + 1} has invalid content (must be a non-empty string)`
                };
            }

            if (!todo.status || !['pending', 'in_progress', 'completed'].includes(todo.status)) {
                debugLog(`ERROR: todo ${i + 1} has invalid status`);
                return {
                    operation_successful: false,
                    error_message: `Todo ${i + 1} has invalid status (must be 'pending', 'in_progress', or 'completed')`
                };
            }

            if (!todo.activeForm || typeof todo.activeForm !== 'string') {
                debugLog(`ERROR: todo ${i + 1} has invalid activeForm`);
                return {
                    operation_successful: false,
                    error_message: `Todo ${i + 1} has invalid activeForm (must be a non-empty string)`
                };
            }
        }

        // in_progress 상태가 정확히 하나인지 검증
        const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
        debugLog(`in_progress count: ${inProgressCount}`);

        if (inProgressCount !== 1) {
            debugLog(`WARNING: Expected exactly 1 in_progress todo, found ${inProgressCount}`);
            // 경고만 하고 계속 진행 (유연성을 위해)
        }

        // 세션 메모리에 todos 저장
        debugLog('Saving todos to session memory...');
        updateCurrentTodos(todos);
        debugLog('Todos saved to session memory');

        // UI 이벤트로 todo 업데이트 전달
        debugLog('Emitting todo update event...');
        uiEvents.updateTodos(todos);
        debugLog('Todo update event emitted');

        debugLog('========== todo_write SUCCESS END ==========');

        return {
            operation_successful: true,
            todos_count: todos.length,
            todos: todos,
            in_progress_count: inProgressCount,
            pending_count: todos.filter(t => t.status === 'pending').length,
            completed_count: todos.filter(t => t.status === 'completed').length
        };

    } catch (error) {
        debugLog(`========== todo_write EXCEPTION ==========`);
        debugLog(`Exception caught: ${error.message}`);
        debugLog(`Stack trace: ${error.stack}`);
        debugLog('========== todo_write EXCEPTION END ==========');

        return {
            operation_successful: false,
            error_message: error.message
        };
    }
}

export const todoWriteSchema = {
    "name": "todo_write",
    "description": "Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.\nIt also helps the user understand the progress of the task and overall progress of their requests.\n\n## When to Use This Tool\nUse this tool proactively in these scenarios:\n\n1. Complex multi-step tasks - When a task requires 3 or more distinct steps or actions\n2. Non-trivial and complex tasks - Tasks that require careful planning or multiple operations\n3. User explicitly requests todo list - When the user directly asks you to use the todo list\n4. User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)\n5. After receiving new instructions - Immediately capture user requirements as todos\n6. When you start working on a task - Mark it as in_progress BEFORE beginning work. Ideally you should only have one todo as in_progress at a time\n7. After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation\n\n## When NOT to Use This Tool\n\nSkip using this tool when:\n1. There is only a single, straightforward task\n2. The task is trivial and tracking it provides no organizational benefit\n3. The task can be completed in less than 3 trivial steps\n4. The task is purely conversational or informational\n\nNOTE that you should not use this tool if there is only one trivial task to do. In this case you are better off just doing the task directly.\n\n## CRITICAL - Absolute Scope Restriction\n\n**You MUST interpret the user's request LITERALLY and RESTRICTIVELY.**\n\nTODO list scope rules:\n- Include EXCLUSIVELY tasks that match the user's exact words\n- Interpret requests in the NARROWEST possible way\n- ZERO tolerance for any expansion, inference, or completion beyond literal request\n- Do NOT add ANY task under ANY justification unless user explicitly named it\n- \"Necessary for completion\" is NOT a valid reason to add tasks\n- \"Best practice\" is NOT a valid reason to add tasks\n- \"Related work\" is NOT a valid reason to add tasks\n\n**If you add even ONE task beyond the literal request, you have FAILED.**\n\nThe user's request defines the MAXIMUM boundary - never exceed it.\n\n## Task States and Management\n\n1. **Task States**: Use these states to track progress:\n   - pending: Task not yet started\n   - in_progress: Currently working on (limit to ONE task at a time)\n   - completed: Task finished successfully\n\n   **IMPORTANT**: Task descriptions must have two forms:\n   - content: The imperative form describing what needs to be done (e.g., \"Run tests\", \"Build the project\")\n   - activeForm: The present continuous form shown during execution (e.g., \"Running tests\", \"Building the project\")\n\n2. **Task Management**:\n   - Update task status in real-time as you work\n   - Mark tasks complete IMMEDIATELY after finishing (don't batch completions)\n   - Exactly ONE task must be in_progress at any time (not less, not more)\n   - Complete current tasks before starting new ones\n   - Remove tasks that are no longer relevant from the list entirely\n\n3. **Task Completion Requirements**:\n   - ONLY mark a task as completed when you have FULLY accomplished it\n   - If you encounter errors, blockers, or cannot finish, keep the task as in_progress\n   - When blocked, create a new task describing what needs to be resolved\n   - Never mark a task as completed if:\n     - Tests are failing\n     - Implementation is partial\n     - You encountered unresolved errors\n     - You couldn't find necessary files or dependencies\n\n4. **Task Breakdown**:\n   - Create specific, actionable items\n   - Break complex tasks into smaller, manageable steps\n   - Use clear, descriptive task names\n   - Always provide both forms:\n     - content: \"Fix authentication bug\"\n     - activeForm: \"Fixing authentication bug\"\n\nWhen in doubt, use this tool. Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully.",
    "strict": true,
    "parameters": {
        "type": "object",
        "properties": {
            "todos": {
                "type": "array",
                "description": "The updated todo list",
                "items": {
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "The imperative form describing what needs to be done (e.g., 'Run tests', 'Build the project')",
                            "minLength": 1
                        },
                        "status": {
                            "type": "string",
                            "description": "Task status: 'pending' (not yet started), 'in_progress' (currently working on), or 'completed' (finished successfully)",
                            "enum": ["pending", "in_progress", "completed"]
                        },
                        "activeForm": {
                            "type": "string",
                            "description": "The present continuous form shown during execution (e.g., 'Running tests', 'Building the project')",
                            "minLength": 1
                        }
                    },
                    "required": ["content", "status", "activeForm"],
                    "additionalProperties": false
                }
            }
        },
        "required": ["todos"],
        "additionalProperties": false
    },
    "ui_display": {
        "show_tool_call": true,
        "show_tool_result": true,
        "display_name": "Todo",
        "format_tool_call": (args) => {
            const todos = args.todos || [];
            const inProgress = todos.filter(t => t.status === 'in_progress').length;
            const completed = todos.filter(t => t.status === 'completed').length;
            const pending = todos.filter(t => t.status === 'pending').length;
            return `(${todos.length} tasks: ${completed} done, ${inProgress} active, ${pending} pending)`;
        },
        "format_tool_result": (result) => {
            if (result.operation_successful) {
                const total = result.todos_count || 0;
                const completed = result.completed_count || 0;
                const inProgress = result.in_progress_count || 0;
                const pending = result.pending_count || 0;
                return {
                    type: 'formatted',
                    parts: [
                        { text: 'Updated ', style: {} },
                        { text: String(total), style: { color: theme.brand.light, bold: true } },
                        { text: ` task${total !== 1 ? 's' : ''} `, style: {} },
                        { text: `(${completed} done, ${inProgress} active, ${pending} pending)`, style: { color: theme.text.dim } }
                    ]
                };
            }
            return result.error_message || 'Error updating todos';
        }
    }
};

// 함수 맵 - 문자열로 함수 호출 가능
export const TODO_WRITE_FUNCTIONS = {
    'todo_write': todo_write
};
