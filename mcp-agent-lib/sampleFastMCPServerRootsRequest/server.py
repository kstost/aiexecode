from fastmcp import FastMCP
from fastmcp.server import Context
import os

mcp = FastMCP("Roots Example Server")

@mcp.tool
async def list_accessible_roots(ctx: Context) -> str:
    """클라이언트가 제공한 roots를 조회합니다."""

    # Roots 목록 요청
    roots = await ctx.list_roots()

    if not roots:
        return "클라이언트가 제공한 roots가 없습니다."

    result = "클라이언트 Roots:\n"
    for idx, root in enumerate(roots, 1):
        result += f"{idx}. {root.name or '(이름 없음)'}: {root.uri}\n"

    return result

@mcp.tool
async def count_files_in_root(root_index: int, ctx: Context) -> str:
    """지정된 root의 파일 개수를 계산합니다."""

    # Roots 목록 요청
    roots = await ctx.list_roots()

    if not roots:
        return "클라이언트가 제공한 roots가 없습니다."

    if root_index < 1 or root_index > len(roots):
        return f"잘못된 인덱스입니다. 1부터 {len(roots)} 사이의 값을 입력하세요."

    selected_root = roots[root_index - 1]
    uri = str(selected_root.uri)  # FileUrl 객체를 문자열로 변환

    # file:// 제거하고 실제 경로 추출
    if uri.startswith("file://"):
        path = uri[7:]  # "file://" 제거
    else:
        return f"지원하지 않는 URI 스키마입니다: {uri}"

    try:
        # 파일/디렉토리 확인
        if not os.path.exists(path):
            return f"경로가 존재하지 않습니다: {path}"

        if os.path.isfile(path):
            return f"단일 파일입니다: {selected_root.name or path}"

        # 디렉토리의 파일 개수 계산
        file_count = 0
        for root, dirs, files in os.walk(path):
            file_count += len(files)

        return f"Root '{selected_root.name or path}'에 총 {file_count}개의 파일이 있습니다."

    except Exception as e:
        return f"오류 발생: {str(e)}"

mcp.run()
