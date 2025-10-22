function consolelog() { }
export async function response_message({ message = "" }) {
    consolelog(`Assistant say: ${message}`);
    return { message };
}

export const responseMessageSchema = {
    "name": "response_message",
    "description": "사용자에게 메시지를 전달할 때 사용합니다. 이 도구는 다른 도구와 함께 사용해야 하며, 단독으로 사용해서는 안 됩니다. 작업을 수행하는 다른 도구들과 병렬로 호출하여 진행 상황을 알려주는 용도입니다.",
    "strict": true,
    "parameters": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "사용자에게 전달할 메시지"
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
