#!/usr/bin/env python3
"""
Python 코드 AST 분석기
- import 구문에서 사용된 모든 모듈/패키지 추출
- 표준 라이브러리와 외부 패키지 구분
- JSON 형태로 결과 반환
"""

import ast
import sys
import json
import os
import importlib.util
import pkgutil

class ImportAnalyzer(ast.NodeVisitor):
    def __init__(self):
        self.imports = set()
        self.from_imports = set()
        
    def visit_Import(self, node):
        """import module 형태 처리"""
        for alias in node.names:
            self.imports.add(alias.name)
        self.generic_visit(node)
    
    def visit_ImportFrom(self, node):
        """from module import ... 형태 처리"""
        if node.module:
            self.from_imports.add(node.module)
        self.generic_visit(node)

def get_top_level_package(module_name):
    """모듈명에서 최상위 패키지명 추출"""
    if '.' in module_name:
        return module_name.split('.')[0]
    return module_name

def is_standard_library(module_name):
    """표준 라이브러리인지 확인"""
    stdlib_modules = {
        'os', 'sys', 'json', 'ast', 'collections', 'itertools', 'functools',
        'datetime', 'time', 're', 'math', 'random', 'hashlib', 'base64',
        'urllib', 'http', 'socket', 'threading', 'subprocess', 'pathlib',
        'io', 'csv', 'xml', 'html', 'email', 'logging', 'argparse',
        'configparser', 'pickle', 'sqlite3', 'uuid', 'copy', 'weakref',
        'gc', 'traceback', 'warnings', 'typing', 'enum', 'dataclasses',
        'contextlib', 'operator', 'heapq', 'bisect', 'array', 'struct',
        'codecs', 'locale', 'gettext', 'calendar', 'sched', 'queue',
        'threading', 'multiprocessing', 'concurrent', 'asyncio', 'ssl',
        'ftplib', 'poplib', 'imaplib', 'smtplib', 'telnetlib', 'socketserver',
        'xmlrpc', 'gzip', 'bz2', 'lzma', 'zipfile', 'tarfile', 'tempfile',
        'shutil', 'glob', 'fnmatch', 'stat', 'filecmp', 'mmap'
    }
    
    top_level = get_top_level_package(module_name)
    
    # 표준 라이브러리에 포함된 모듈인지 확인
    if top_level in stdlib_modules:
        return True
    
    # 추가 확인: importlib을 사용한 정확한 확인
    try:
        spec = importlib.util.find_spec(top_level)
        if spec and spec.origin:
            # 표준 라이브러리 경로에 있는지 확인
            stdlib_path = os.path.dirname(os.__file__)
            return spec.origin.startswith(stdlib_path)
    except (ImportError, ModuleNotFoundError, ValueError):
        pass
    
    return False

def analyze_python_code(code_text):
    """Python 코드를 AST로 분석하여 사용된 패키지 추출"""
    try:
        # AST 파싱
        tree = ast.parse(code_text)
        
        # Import 분석
        analyzer = ImportAnalyzer()
        analyzer.visit(tree)
        
        # 모든 import된 모듈 수집
        all_modules = set()
        all_modules.update(analyzer.imports)
        all_modules.update(analyzer.from_imports)
        
        # 최상위 패키지명으로 변환
        top_level_packages = set()
        for module in all_modules:
            top_level = get_top_level_package(module)
            top_level_packages.add(top_level)
        
        # 표준 라이브러리와 외부 패키지 구분
        external_packages = []
        standard_modules = []
        
        for package in sorted(top_level_packages):
            if is_standard_library(package):
                standard_modules.append(package)
            else:
                external_packages.append(package)
        
        return {
            'success': True,
            'external_packages': external_packages,
            'standard_modules': standard_modules,
            'all_imports': sorted(list(all_modules)),
            'analysis_summary': {
                'total_imports': len(all_modules),
                'external_count': len(external_packages),
                'standard_count': len(standard_modules)
            }
        }
        
    except SyntaxError as e:
        return {
            'success': False,
            'error': f'구문 오류: {str(e)}',
            'error_type': 'SyntaxError',
            'line_number': getattr(e, 'lineno', None)
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'분석 오류: {str(e)}',
            'error_type': type(e).__name__
        }

def main():
    """메인 함수"""
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': '사용법: python ast-analyzer.py <python_file_path>',
            'error_type': 'ArgumentError'
        }))
        return
    
    file_path = sys.argv[1]
    
    if not os.path.exists(file_path):
        print(json.dumps({
            'success': False,
            'error': f'파일이 존재하지 않습니다: {file_path}',
            'error_type': 'FileNotFoundError'
        }))
        return
    
    try:
        # 파일 읽기
        with open(file_path, 'r', encoding='utf-8') as f:
            code_text = f.read()
        
        # AST 분석 실행
        result = analyze_python_code(code_text)
        result['analyzed_file'] = file_path
        
        # JSON 형태로 결과 출력
        print(json.dumps(result, ensure_ascii=False, indent=2))
        
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'파일 처리 오류: {str(e)}',
            'error_type': type(e).__name__,
            'analyzed_file': file_path
        }))

if __name__ == '__main__':
    main() 


