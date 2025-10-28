#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(__dirname, 'package.json');

try {
    // package.json 읽기
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    // 현재 버전 파싱
    const versionParts = packageJson.version.split('.');

    if (versionParts.length !== 3) {
        console.error('❌ Invalid version format. Expected x.y.z format.');
        process.exit(1);
    }

    // 세 번째 자릿수 증가
    const [major, minor, patch] = versionParts;
    const newPatch = parseInt(patch, 10) + 1;
    const newVersion = `${major}.${minor}.${newPatch}`;

    // 버전 업데이트
    packageJson.version = newVersion;

    // package.json 저장
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');

    console.log(`✓ Version updated: ${versionParts.join('.')} → ${newVersion}`);
} catch (error) {
    console.error('❌ Error updating version:', error.message);
    process.exit(1);
}
