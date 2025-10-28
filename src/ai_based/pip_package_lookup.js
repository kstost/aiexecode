import dotenv from "dotenv";
import { request, getModelForProvider } from "../system/ai_request.js";
import { safeReadFile, safeWriteFile } from '../util/safe_fs.js';
import { join } from 'path';
import { CONFIG_DIR, ensureConfigDirectory } from "../util/config.js";
import { createDebugLogger } from "../util/debug_log.js";

const debugLog = createDebugLogger('pip_package_lookup.log', 'pip_package_lookup');

dotenv.config({ quiet: true });

// 이 파일은 import에 쓰인 이름을 실제 pip 설치 이름과 연결해 줍니다.
// pip_package_installer가 정확한 패키지를 설치할 수 있도록 모든 모듈이 같은 이름을 공유하게 만듭니다.
// Package name cache file path
const CACHE_FILE = join(CONFIG_DIR, 'package_name_store.json');

// 캐시 파일에서 미리 확인해 둔 패키지 매핑을 읽어옵니다.
async function loadPackageStore() {
    try {
        await ensureConfigDirectory();
        const data = await safeReadFile(CACHE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Return empty object if file doesn't exist or can't be read
        return {};
    }
}

// 새로 찾은 패키지 정보를 캐시 파일에 저장합니다.
async function savePackageStore(store) {
    try {
        await ensureConfigDirectory();
        await safeWriteFile(CACHE_FILE, JSON.stringify(store, null, 2), 'utf8');
        debugLog(`✓ Package cache saved to ${CACHE_FILE}`);
    } catch (error) {
        debugLog('Failed to save package cache:', error);
    }
}


const pythonPackageNameListSchema = {
    "type": "object",
    "properties": {
        "package_mappings": {
            "type": "array",
            "description": "List of mappings between import names and pip install package names.",
            "items": {
                "type": "object",
                "properties": {
                    "import_name": {
                        "type": "string",
                        "description": "Python module import name.",
                        "minLength": 1
                    },
                    "pip_name": {
                        "type": "string",
                        "description": "Package name used for pip install.",
                        "minLength": 1
                    }
                },
                "required": [
                    "import_name",
                    "pip_name"
                ],
                "additionalProperties": false
            }
        }
    },
    "required": [
        "package_mappings"
    ],
    "additionalProperties": false
};

// AI에게 전달할 대화 형식 메시지 묶음을 만들어 줍니다.
function buildConversationHistory(systemMessage, dialogHistory) {
    const messages = [
        {
            role: "system",
            content: [{
                type: "input_text",
                text: systemMessage
            }]
        }
    ];

    for (const dialog of dialogHistory) {
        messages.push({
            role: dialog.role,
            content: [{
                type: "input_text",
                text: dialog.content
            }]
        });
    }

    return messages;
}

// import 이름 목록을 받아 실제 pip 패키지 이름을 알려줍니다.
export async function checkValidPackageName(pkgList) {
    const taskName = 'pip_package_lookup';
    
    // 1. 캐시 파일에서 패키지 매핑 로드
    const packageStore = await loadPackageStore();
    
    // 2. 캐시에서 확인할 수 있는 패키지들과 AI 요청이 필요한 패키지들 분리
    const cachedResults = [];
    const uncachedPackages = [];
    
    for (const pkg of pkgList) {
        if (packageStore.hasOwnProperty(pkg)) {
            debugLog(`✓ Found in cache: ${pkg} -> ${packageStore[pkg]}`);
            // 캐시된 값이 null이 아닌 경우만 결과에 추가 (표준 라이브러리는 null로 저장됨)
            if (packageStore[pkg] !== null) {
                cachedResults.push(packageStore[pkg]);
            }
        } else {
            uncachedPackages.push(pkg);
        }
    }
    
    // 3. 캐시되지 않은 패키지가 없으면 캐시 결과만 반환
    if (uncachedPackages.length === 0) {
        debugLog("All packages found in cache, no AI request needed");
        return cachedResults;
    }
    
    debugLog(`Cache miss for packages: ${uncachedPackages.join(', ')}`);
    debugLog("Making AI request for uncached packages...");
    
    // 4. AI에게 캐시되지 않은 패키지들만 요청
    const codeGenerationTemplate = [
        "You are an expert in validating PyPI Python package names.",
        "The user will provide package names used in imports.",
        "Respond with the correct package names for pip install.",
        "For example: 'PIL' should be 'Pillow', 'cv2' should be 'opencv-python'.",
        "If a package is part of Python standard library, exclude it from the list."
    ].join("\n");

    const dialogHistory = [{
        role: 'user',
        content: `Package names to validate: ${uncachedPackages.join(', ')}`
    }];

    const conversationHistory = buildConversationHistory(codeGenerationTemplate, dialogHistory);

    try {
        const model = await getModelForProvider();
        const response = await request(taskName, {
            model: model,
            input: conversationHistory,
            text: {
                "format": {
                    "type": "json_schema",
                    "name": "pip_package_name_list",
                    "strict": true,
                    "schema": pythonPackageNameListSchema
                }
            },
            reasoning: {},
            max_output_tokens: 2048,
            store: true
        });
        const codeResponse = JSON.parse(response.output_text);

        // 5. AI 응답 결과를 캐시에 저장
        const aiResults = [];
        const receivedMappings = new Set();
        
        for (const { import_name, pip_name } of codeResponse.package_mappings) {
            packageStore[import_name] = pip_name;
            aiResults.push(pip_name);
            receivedMappings.add(import_name);
            debugLog(`✓ Cached: ${import_name} -> ${pip_name}`);
        }
        
        // 6. AI 응답에 포함되지 않은 패키지들은 표준 라이브러리로 간주하여 null로 캐시
        for (const pkg of uncachedPackages) {
            if (!receivedMappings.has(pkg)) {
                packageStore[pkg] = null;
                debugLog(`✓ Cached as standard library: ${pkg} -> null`);
            }
        }

        // 7. 업데이트된 캐시를 파일에 저장
        await savePackageStore(packageStore);

        // 8. 캐시 결과와 AI 결과 합쳐서 반환
        return [...cachedResults, ...aiResults];
        
    } catch (error) {
        debugLog("Error validating package names:", error);
        // 에러 발생 시 캐시 결과와 원본 패키지명 반환
        return [...cachedResults, ...uncachedPackages];
    }
}
