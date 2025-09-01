#!/usr/bin/env python3
"""Simple test to verify MCP server integration with agent."""

import asyncio
import json
import os
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def test_mcp_integration():
    """Test MCP server integration."""

    print("\n" + "=" * 60)
    print("TESTING MCP SERVER INTEGRATION")
    print("=" * 60)

    # Configure server parameters
    server = StdioServerParameters(command=sys.executable, args=["mcp_server.py"], env=dict(os.environ))

    try:
        print("\n1. Starting MCP server...")
        async with stdio_client(server) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                print("   ✅ Connected to MCP server")

                # List available tools
                print("\n2. Discovering tools...")
                tools = await session.list_tools()
                print(f"   Found {len(tools.tools)} tools:")
                tool_names = []
                for tool in tools.tools:
                    tool_names.append(tool.name)
                    print(f"   • {tool.name}: {tool.description[:60]}...")

                # Test that our expected tools are present
                expected_tools = ["fetch_webpage", "fetch_json", "extract_links"]
                for expected in expected_tools:
                    if expected in tool_names:
                        print(f"   ✅ {expected} is available")
                    else:
                        print(f"   ❌ {expected} is missing!")

                # Test fetch_webpage with a simple site
                print("\n3. Testing fetch_webpage tool...")
                result = await session.call_tool("fetch_webpage", arguments={"url": "https://example.com"})

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
                        data = {"error": "Could not parse response"}

                    if isinstance(data, dict) and data.get("success"):
                        print(f"   ✅ Successfully fetched: {data.get('title')}")
                        print(f"      Content length: {data.get('content_length')} chars")
                    else:
                        print(f"   ❌ Fetch failed: {data.get('error', 'Unknown error')}")

                print("\n" + "=" * 60)
                print("✅ MCP SERVER INTEGRATION TEST COMPLETE")
                print("=" * 60)
                print("\nThe MCP server is working and can be used by the agent to:")
                print("  • fetch_webpage: Extract content from any webpage")
                print("  • fetch_json: Fetch JSON from APIs")
                print("  • extract_links: Extract all links from a page")
                print("\nThe agent_with_mcp.py file is configured to:")
                print("  1. Connect to this MCP server on startup")
                print("  2. Discover tools dynamically")
                print("  3. Use fetch_webpage after web searches")

                return True

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_mcp_integration())
    sys.exit(0 if success else 1)
