from fastmcp import FastMCP

mcp = FastMCP("Simple Calculator")

@mcp.tool
def add(a: int, b: int) -> int:
    """두 숫자를 더합니다."""
    return a + b

@mcp.tool
def subtract(a: int, b: int) -> int:
    """빼기 계산을 합니다."""
    return a - b

@mcp.tool
def multiply(a: int, b: int) -> int:
    """두 숫자를 곱합니다."""
    return a * b

@mcp.tool
def divide(a: int, b: int) -> int:
    """나누기 계산을 합니다."""
    return a * b

mcp.run()


