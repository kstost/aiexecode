import { checkValidPackageName } from "./pip_package_lookup.js";
import { installPythonPackage, isPackageInstalled, analyzeImports } from "../system/code_executer.js";

// 이 파일은 코드에서 필요로 하는 파이썬 패키지를 확인하고 자동으로 설치합니다.
// Code Executer가 스크립트를 실행할 때 패키지 누락 오류가 나지 않도록 Orchestrator 실행 이전에 환경을 준비합니다.
function consolelog() { }

// 하나의 파일을 분석해 필요한 외부 패키지를 찾아 설치합니다.
export async function installRequiredPackages(filePath) {
    try {
        const analysisResult = await analyzeImports(filePath);
        const externalPackages = analysisResult;
        if (externalPackages.length === 0) {
            return {
                success: true,
                message: "No external packages required",
                installedPackages: []
            };
        }
        const validPackageNames = await checkValidPackageName(externalPackages);
        const installResults = [];
        const alreadyInstalled = [];
        const failedInstalls = [];

        for (const packageName of validPackageNames) {
            const isInstalled = await isPackageInstalled(packageName);
            if (isInstalled) {
                alreadyInstalled.push(packageName);
                continue;
            }
            const installSuccess = await installPythonPackage(packageName);
            if (installSuccess) {
                installResults.push(packageName);
            } else {
                failedInstalls.push(packageName);
            }
        }

        return {
            success: failedInstalls.length === 0,
            originalPackages: externalPackages,
            validatedPackages: validPackageNames,
            installedPackages: installResults,
            alreadyInstalled: alreadyInstalled,
            failedInstalls: failedInstalls,
            summary: {
                total: validPackageNames.length,
                installed: installResults.length,
                alreadyInstalled: alreadyInstalled.length,
                failed: failedInstalls.length
            }
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            details: error
        };
    }
}

export async function installPackageList(packageList) {
    try {
        consolelog(`\n=== Installing package list ===`);
        consolelog("Packages to install:", packageList);

        const validPackageNames = await checkValidPackageName(packageList);
        consolelog("Valid package names:", validPackageNames);

        const installResults = [];
        const alreadyInstalled = [];
        const failedInstalls = [];

        for (const packageName of validPackageNames) {
            consolelog(`\n--- Processing package: ${packageName} ---`);

            const isInstalled = await isPackageInstalled(packageName);
            if (isInstalled) {
                consolelog(`[SKIP] ${packageName} is already installed`);
                alreadyInstalled.push(packageName);
                continue;
            }

            consolelog(`Installing ${packageName}...`);
            const installSuccess = await installPythonPackage(packageName);

            if (installSuccess) {
                consolelog(`[OK] Successfully installed ${packageName}`);
                installResults.push(packageName);
            } else {
                consolelog(`[FAIL] Failed to install ${packageName}`);
                failedInstalls.push(packageName);
            }
        }

        return {
            success: failedInstalls.length === 0,
            originalPackages: packageList,
            validatedPackages: validPackageNames,
            installedPackages: installResults,
            alreadyInstalled: alreadyInstalled,
            failedInstalls: failedInstalls,
            summary: {
                total: validPackageNames.length,
                installed: installResults.length,
                alreadyInstalled: alreadyInstalled.length,
                failed: failedInstalls.length
            }
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            details: error
        };
    }
}

export async function installRequiredPackagesForFiles(filePaths) {
    try {
        consolelog(`\n=== Analyzing multiple files ===`);
        consolelog("Files to analyze:", filePaths);

        const allExternalPackages = new Set();
        const analysisResults = [];

        for (const filePath of filePaths) {
            const analysisResult = await analyzeImports(filePath);
            analysisResults.push({
                file: filePath,
                success: analysisResult.success,
                packages: analysisResult.success ? analysisResult.data.external_packages : []
            });

            if (analysisResult.success) {
                analysisResult.data.external_packages.forEach(pkg =>
                    allExternalPackages.add(pkg)
                );
            }
        }

        const uniquePackages = Array.from(allExternalPackages);
        consolelog("All unique external packages:", uniquePackages);

        if (uniquePackages.length === 0) {
            return {
                success: true,
                message: "No external packages required",
                analysisResults: analysisResults,
                installedPackages: []
            };
        }

        const installResult = await installPackageList(uniquePackages);

        return {
            ...installResult,
            analysisResults: analysisResults,
            filesAnalyzed: filePaths.length
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            details: error
        };
    }
}
