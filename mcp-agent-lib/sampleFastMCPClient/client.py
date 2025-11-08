import asyncio
from fastmcp import Client

client = Client("../sampleFastMCPServer/server.py")

async def main():
    print("")
    async with client:
        print(f"접속상태: {client.is_connected()}")
        print("")

        tools = await client.list_tools()
        print(f"사용가능한 도구들: {tools}")
        print("")

        if any(tool.name == "add" for tool in tools):
            result = await client.call_tool("add", {"a": 3, "b": 7})
            print(f"add 도구 사용의 결과: {result}")
            print("")

    print(f"접속상태: {client.is_connected()}")
    print("")

if __name__ == "__main__":
    asyncio.run(main())
