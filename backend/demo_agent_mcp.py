#!/usr/bin/env python3
"""Demonstration of agent with MCP integration."""

import asyncio
import json
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(__file__))

from agent.agent_with_mcp import stream_agent_response  # noqa: E402


async def demo_agent_mcp():
    """Demonstrate the agent using MCP tools."""

    print("\n" + "=" * 60)
    print("AGENT WITH MCP INTEGRATION DEMO")
    print("=" * 60)

    # Demo queries that should trigger MCP tools
    demos = [
        {"query": "What does the example.com website say?", "expected": "Should call fetch_webpage directly"},
        {"query": "Get the JSON data from https://httpbin.org/json", "expected": "Should call fetch_json"},
        {"query": "Extract all links from https://example.com", "expected": "Should call extract_links"},
    ]

    print("\nThis demo shows how the agent can:")
    print("1. Fetch webpage content directly")
    print("2. Call JSON APIs")
    print("3. Extract links from pages")
    print("\nNote: Requires OPENAI_API_KEY to be set")

    # Check for API key
    if not os.getenv("OPENAI_API_KEY"):
        print("\n❌ OPENAI_API_KEY not set")
        print("   Please set it to test the agent:")
        print("   export OPENAI_API_KEY='your-key-here'")
        return

    print("\n✅ OPENAI_API_KEY is set")

    for demo in demos:
        print(f"\n{'='*60}")
        print(f"Query: {demo['query']}")
        print(f"Expected: {demo['expected']}")
        print("-" * 60)

        try:
            tools_called = []
            response_text = []

            async for chunk in stream_agent_response(
                user_message=demo["query"], user_id="demo_user", space_id="demo_space"
            ):
                # Parse SSE format
                if chunk.startswith("event:"):
                    lines = chunk.strip().split("\n")
                    event_type = lines[0].split(": ")[1] if ": " in lines[0] else ""

                    if len(lines) > 1 and lines[1].startswith("data: "):
                        data_str = lines[1][6:]
                        try:
                            data = json.loads(data_str)

                            if event_type == "ready":
                                mcp_tools = [
                                    t
                                    for t in data.get("tools", [])
                                    if t in ["fetch_webpage", "fetch_json", "extract_links"]
                                ]
                                if mcp_tools:
                                    print(f"MCP tools available: {mcp_tools}")

                            elif event_type == "tool_result":
                                tool_name = data.get("tool")
                                tools_called.append(tool_name)
                                args = data.get("args", {})
                                result = data.get("data", {})

                                print(f"\n🔧 Tool called: {tool_name}")
                                if args:
                                    print(f"   Args: {json.dumps(args, indent=2)}")

                                if result.get("success"):
                                    if tool_name == "fetch_webpage":
                                        print(f"   ✅ Fetched: {result.get('title', 'No title')}")
                                        print(f"   Content length: {result.get('content_length', 0)} chars")
                                    elif tool_name == "fetch_json":
                                        print("   ✅ Got JSON data")
                                        if isinstance(result.get("data"), dict):
                                            print(f"   Keys: {list(result.get('data', {}).keys())[:5]}")
                                    elif tool_name == "extract_links":
                                        print(f"   ✅ Found {result.get('total_links', 0)} links")
                                        for link in result.get("links", [])[:3]:
                                            print(f"     - {link.get('text', 'No text')[:50]}")
                                else:
                                    print(f"   ❌ Failed: {result.get('error', 'Unknown error')}")

                            elif event_type == "token":
                                response_text.append(data.get("token", ""))

                            elif event_type == "done":
                                if data.get("ok"):
                                    print("\n✅ Response complete")

                        except json.JSONDecodeError:
                            pass

            # Show summary
            if tools_called:
                print(f"\nTools used: {tools_called}")

            final_response = "".join(response_text)
            if final_response:
                print("\nAgent response (first 200 chars):")
                print(f"{final_response[:200]}...")

        except Exception as e:
            print(f"❌ Error: {e}")

    print("\n" + "=" * 60)
    print("DEMO COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    print("Starting MCP Agent Demo...")
    asyncio.run(demo_agent_mcp())
