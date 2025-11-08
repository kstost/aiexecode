from fastmcp import FastMCP

mcp = FastMCP("Simple Calculator")

@mcp.tool
def add(a: int, b: int) -> int:
    """두 숫자를 더합니다."""
    return a + b

mcp.run()


