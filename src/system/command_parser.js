// 간단한 슬래시 커맨드 파서
// 사용자가 입력한 문자열에서 커맨드와 인자를 분리합니다.

/**
 * 슬래시 커맨드를 파싱합니다.
 * @param {string} input - 사용자 입력 문자열 (예: "/help", "/exit", "/clear history")
 * @returns {Object} 파싱된 커맨드 객체 { command, args, raw }
 */
export function parseCommand(input) {
    if (!input || typeof input !== 'string') {
        return null;
    }

    const trimmed = input.trim();

    // 슬래시로 시작하지 않으면 커맨드가 아님
    if (!trimmed.startsWith('/')) {
        return null;
    }

    // 슬래시를 제거하고 공백으로 분리
    const withoutSlash = trimmed.substring(1);
    const parts = withoutSlash.split(/\s+/);

    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    return {
        command,      // 커맨드 이름 (예: "help", "exit")
        args,         // 인자 배열 (예: ["history"])
        raw: trimmed  // 원본 입력
    };
}

/**
 * 커맨드가 유효한지 확인합니다.
 * @param {string} input - 사용자 입력 문자열
 * @returns {boolean} 커맨드 여부
 */
export function isCommand(input) {
    return parseCommand(input) !== null;
}

/**
 * 사용 가능한 커맨드 목록을 관리하는 클래스
 */
export class CommandRegistry {
    constructor() {
        this.commands = new Map();
    }

    /**
     * 커맨드를 등록합니다.
     * @param {string} name - 커맨드 이름
     * @param {Object} config - 커맨드 설정 { handler, description, usage }
     */
    register(name, config) {
        this.commands.set(name.toLowerCase(), {
            name,
            handler: config.handler,
            description: config.description || '',
            usage: config.usage || `/${name}`
        });
    }

    /**
     * 커맨드를 실행합니다.
     * @param {string} input - 사용자 입력
     * @returns {Promise<any>} 커맨드 실행 결과
     */
    async execute(input) {
        const parsed = parseCommand(input);

        if (!parsed) {
            throw new Error('Invalid command format');
        }

        const commandConfig = this.commands.get(parsed.command);

        if (!commandConfig) {
            throw new Error(`Unknown command: ${parsed.command}`);
        }

        return await commandConfig.handler(parsed.args, parsed);
    }

    /**
     * 등록된 모든 커맨드 목록을 가져옵니다.
     * @returns {Array} 커맨드 목록
     */
    getCommands() {
        return Array.from(this.commands.values());
    }

    /**
     * 특정 커맨드가 등록되어 있는지 확인합니다.
     * @param {string} name - 커맨드 이름
     * @returns {boolean}
     */
    has(name) {
        return this.commands.has(name.toLowerCase());
    }
}
