#!/usr/bin/env python3
import requests
import os
from markitdown import MarkItDown
from urllib.parse import urljoin, urlparse
import json
import sys

def fetch_and_convert(url, timeout=30, user_agent='Mozilla/5.0 (compatible; WebFetcher/1.0)', encoding='utf-8'):
    try:
        # 요청 헤더 설정
        headers = {
            'User-Agent': user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
        }

        # 웹 페이지 다운로드
        print(f"Fetching: {url}", file=sys.stderr)
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()

        # 콘텐츠 타입 확인
        content_type = response.headers.get('content-type', '').lower()
        print(f"Content-Type: {content_type}", file=sys.stderr)

        # HTML 콘텐츠 임시 저장
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.html', encoding=encoding, delete=False) as temp_file:
            temp_html_path = temp_file.name
            temp_file.write(response.text)

        # MarkItDown으로 변환
        md = MarkItDown()
        print("Converting to markdown...", file=sys.stderr)
        result = md.convert(temp_html_path)

        # 임시 파일 삭제
        os.remove(temp_html_path)

        # 마크다운 내용 생성
        markdown_content = f"# {result.title or 'Web Page'}\n\n"
        markdown_content += f"**Original URL**: {url}\n"
        markdown_content += f"**Fetched**: {response.headers.get('date', 'Unknown')}\n"
        markdown_content += f"**Content-Type**: {content_type}\n\n"
        markdown_content += "---\n\n"
        markdown_content += result.text_content

        # stdout으로 출력
        print(markdown_content)
        print(f"Successfully fetched and converted: {url}", file=sys.stderr)
        return True

    except requests.RequestException as e:
        print(f"Network error: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Conversion error: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python web_download.py <url> [timeout] [user_agent] [encoding]", file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    user_agent = sys.argv[3] if len(sys.argv) > 3 else 'Mozilla/5.0 (compatible; WebFetcher/1.0)'
    encoding = sys.argv[4] if len(sys.argv) > 4 else 'utf-8'

    success = fetch_and_convert(url, timeout, user_agent, encoding)
    sys.exit(0 if success else 1)