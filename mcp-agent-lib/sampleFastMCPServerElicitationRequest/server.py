from fastmcp import FastMCP
from fastmcp.server import Context

mcp = FastMCP("Elicitation Example Server")

@mcp.tool
async def add_with_confirmation(a: int, b: int, ctx: Context) -> str:
    """두 숫자를 더합니다. 실행 전에 사용자 확인을 요청합니다."""

    # Elicitation 요청 - 사용자에게 확인 요청 (boolean 타입 사용)
    result = await ctx.elicit(
        message=f"{a} + {b}를 계산하시겠습니까?",
        response_type=bool
    )

    # 사용자 응답 확인
    if hasattr(result, 'data') and result.data:
        calculation_result = a + b
        response = f"계산 완료: {a} + {b} = {calculation_result}"
        return response
    else:
        return f"계산이 취소되었습니다. (action: {type(result).__name__})"

@mcp.tool
async def greet_user(ctx: Context) -> str:
    """사용자의 이름을 물어보고 인사합니다."""

    # Elicitation 요청 - 사용자 이름 입력 받기
    result = await ctx.elicit(
        message="안녕하세요! 당신의 이름을 알려주세요.",
        response_type=str
    )

    if hasattr(result, 'data'):
        name = result.data
        greeting = f"안녕하세요, {name}님!"
        return greeting
    else:
        return f"인사를 건너뛰었습니다. (action: {type(result).__name__})"

mcp.run()


