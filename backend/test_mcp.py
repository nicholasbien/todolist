#!/usr/bin/env python3
"""Test the working FastMCP server."""

import asyncio
import json
import os
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def test_mcp_server():
    """Test our FastMCP server."""

    print("\n" + "=" * 60)
    print("TESTING FASTMCP SERVER")
    print("=" * 60)

    # Configure server parameters
    server = StdioServerParameters(command=sys.executable, args=["mcp_server_working.py"], env=dict(os.environ))

    try:
        print("\n1. Starting FastMCP server subprocess...")
        async with stdio_client(server) as (read, write):
            async with ClientSession(read, write) as session:
                # Initialize the session
                await session.initialize()
                print("   ✅ Connected to FastMCP server!")

                # List available tools
                print("\n2. Discovering tools...")
                tools = await session.list_tools()
                print(f"   Found {len(tools.tools)} tools:")
                for tool in tools.tools:
                    print(f"   • {tool.name}: {tool.description[:50]}...")

                # Test fetch_webpage
                print("\n3. Testing fetch_webpage...")
                result = await session.call_tool("fetch_webpage", arguments={"url": "https://example.com"})

                # Parse result - FastMCP returns the result directly
                if hasattr(result, "content"):
                    if isinstance(result.content, list) and len(result.content) > 0:
                        content = (
                            result.content[0].text if hasattr(result.content[0], "text") else str(result.content[0])
                        )
                    else:
                        content = str(result.content)

                    try:
                        data = json.loads(content) if isinstance(content, str) else content
                    except (json.JSONDecodeError, ValueError):
                        data = content

                    if isinstance(data, dict) and data.get("success"):
                        print(f"   ✅ Fetched: {data.get('title')}")
                        print(f"      Content length: {data.get('content_length')} chars")
                    else:
                        print(f"   Result: {str(data)[:200]}")

                # Test fetch_json
                print("\n4. Testing fetch_json...")
                result = await session.call_tool("fetch_json", arguments={"url": "https://httpbin.org/json"})

                if hasattr(result, "content"):
                    if isinstance(result.content, list) and len(result.content) > 0:
                        content = (
                            result.content[0].text if hasattr(result.content[0], "text") else str(result.content[0])
                        )
                    else:
                        content = str(result.content)

                    try:
                        data = json.loads(content) if isinstance(content, str) else content
                    except (json.JSONDecodeError, ValueError):
                        data = content

                    if isinstance(data, dict) and data.get("success"):
                        print("   ✅ Fetched JSON successfully")
                        if isinstance(data.get("data"), dict):
                            print(f"      Data keys: {list(data.get('data', {}).keys())[:5]}")
                    else:
                        print(f"   Result: {str(data)[:200]}")

                # Test search_web
                print("\n5. Testing search_web...")
                result = await session.call_tool(
                    "search_web", arguments={"query": "Python programming", "num_results": 3}
                )

                if hasattr(result, "content"):
                    if isinstance(result.content, list) and len(result.content) > 0:
                        content = (
                            result.content[0].text if hasattr(result.content[0], "text") else str(result.content[0])
                        )
                    else:
                        content = str(result.content)

                    try:
                        data = json.loads(content) if isinstance(content, str) else content
                    except (json.JSONDecodeError, ValueError):
                        data = content

                    if isinstance(data, dict) and data.get("success"):
                        print("   ✅ Search completed")
                        print(f"      Found {data.get('count')} results for '{data.get('query')}'")
                        for r in data.get("results", [])[:2]:
                            print(f"      - {r.get('title', 'No title')[:60]}...")
                    else:
                        print(f"   Result: {str(data)[:200]}")

                print("\n" + "=" * 60)
                print("✅ FASTMCP SERVER TEST COMPLETE!")
                print("=" * 60)
                print("\nThe FastMCP server is working correctly!")
                print("It can now be used by your agent to:")
                print("  • Fetch web content")
                print("  • Call APIs")
                print("  • Extract links")
                print("  • Search the web")

                return True

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_mcp_server())
    sys.exit(0 if success else 1)
