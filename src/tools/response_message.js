export async function response_message({ message = "" }) {
    return { message };
}

export const responseMessageSchema = {
    "name": "response_message",
    "description": "CORE PRINCIPLE: This tool reports completed or ongoing actions to the user. ZERO TOLERANCE FOR INTERROGATIVES: Never use interrogative form. Never seek user input or decisions. Content must be purely declarative statements about what was done or what is being done. Also forbidden: code explanations, implementation details, technical descriptions.",
    "strict": true,
    "parameters": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "FUNDAMENTAL RULE: Use only declarative mood to report actions performed or in progress. ABSOLUTE PROHIBITION: Interrogative mood in any form. Never request, ask, or seek. State what happened or what is happening. Never explain code or implementation. Keep concise and action-focused."
            }
        },
        "required": ["message"],
        "additionalProperties": false
    },
    "ui_display": {
        "show_tool_call": false,
        "show_tool_result": false,
        "extract_message_from": "message"
    }
};

// 함수 맵 - 문자열로 함수 호출 가능
export const RESPONSE_MESSAGE_FUNCTIONS = {
    'response_message': response_message
};
