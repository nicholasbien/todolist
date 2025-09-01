#!/usr/bin/env python3
"""Test the agent with MCP integration to ensure it calls fetch_webpage on search results."""

import asyncio
import json
import logging
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(__file__))

from agent.agent_with_mcp import stream_agent_response  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_agent_search_and_fetch():
    """Test that agent calls fetch_webpage on search results."""

    print("\n" + "=" * 60)
    print("TESTING AGENT WITH MCP INTEGRATION")
    print("=" * 60)

    # Set up test environment
    os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY", "")
    if not os.environ["OPENAI_API_KEY"]:
        print("❌ OPENAI_API_KEY not set. Please set it to test the agent.")
        return False

    # Test queries that should trigger search + fetch
    test_queries = [
        "What are the latest features in Python 3.12?",
        "Tell me about the benefits of FastAPI framework",
        "What is Model Context Protocol (MCP) and how does it work?",
    ]

    for query in test_queries:
        print(f"\n📝 Testing query: '{query}'")
        print("-" * 40)

        tools_called = []
        response_content = []

        try:
            # Stream the agent response
            async for chunk in stream_agent_response(user_message=query, user_id="test_user", space_id="test_space"):
                # Parse SSE format
                if chunk.startswith("event:"):
                    lines = chunk.strip().split("\n")
                    event_type = lines[0].split(": ")[1] if ": " in lines[0] else ""

                    if len(lines) > 1 and lines[1].startswith("data: "):
                        data_str = lines[1][6:]  # Remove "data: " prefix
                        try:
                            data = json.loads(data_str)

                            if event_type == "ready":
                                print(f"✅ Agent ready with tools: {data.get('tools', [])[:5]}...")

                            elif event_type == "tool_result":
                                tool_name = data.get("tool")
                                tools_called.append(tool_name)

                                if tool_name == "web_search":
                                    results = data.get("data", {}).get("results", [])
                                    print(f"🔍 web_search: Found {len(results)} results")
                                    for r in results[:2]:
                                        print(f"   - {r.get('title', 'No title')[:60]}...")

                                elif tool_name == "fetch_webpage":
                                    args = data.get("args", {})
                                    url = args.get("url", "")
                                    result = data.get("data", {})
                                    if result.get("success"):
                                        print(f"📄 fetch_webpage: Fetched '{result.get('title', 'No title')}'")
                                        print(f"   URL: {url[:80]}...")
                                        print(f"   Content length: {result.get('content_length', 0)} chars")
                                    else:
                                        print(f"❌ fetch_webpage failed: {result.get('error', 'Unknown error')}")

                            elif event_type == "token":
                                token = data.get("token", "")
                                response_content.append(token)

                            elif event_type == "done":
                                if data.get("ok"):
                                    print("✅ Response complete")
                                else:
                                    print("❌ Response ended with error")

                            elif event_type == "error":
                                print(f"❌ Error: {data.get('message', 'Unknown error')}")

                        except json.JSONDecodeError:
                            pass

            # Analyze results
            print("\n📊 Analysis:")
            print(f"   Tools called: {tools_called}")

            # Check if the expected workflow was followed
            has_search = "web_search" in tools_called
            has_fetch = "fetch_webpage" in tools_called

            if has_search and has_fetch:
                # Find if fetch was called after search
                search_idx = tools_called.index("web_search")
                fetch_idx = tools_called.index("fetch_webpage")
                if fetch_idx > search_idx:
                    print("   ✅ SUCCESS: Agent searched and then fetched content from results!")
                else:
                    print("   ⚠️  WARNING: fetch_webpage was called but not after web_search")
            elif has_search and not has_fetch:
                print("   ⚠️  WARNING: Agent searched but didn't fetch content from results")
                print("   💡 TIP: The agent should be calling fetch_webpage on relevant URLs")
            elif not has_search:
                print("   ℹ️  INFO: This query didn't trigger a web search")

            # Show part of the final response
            final_response = "".join(response_content)
            if final_response:
                print("\n📝 Response preview (first 300 chars):")
                print(f"   {final_response[:300]}...")

        except Exception as e:
            print(f"❌ Error during test: {e}")
            import traceback

            traceback.print_exc()

    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)
    print("\nExpected behavior:")
    print("1. Agent should call web_search for information queries")
    print("2. Agent should then call fetch_webpage on relevant results")
    print("3. Final response should include detailed information from fetched pages")

    return True


async def test_simple_fetch():
    """Test a simple direct fetch_webpage call."""

    print("\n" + "=" * 60)
    print("TESTING DIRECT FETCH REQUEST")
    print("=" * 60)

    query = "Fetch the content from https://example.com and tell me what it says"

    print(f"📝 Query: '{query}'")

    tools_called = []

    try:
        async for chunk in stream_agent_response(user_message=query, user_id="test_user", space_id="test_space"):
            if chunk.startswith("event: tool_result"):
                lines = chunk.strip().split("\n")
                if len(lines) > 1 and lines[1].startswith("data: "):
                    data_str = lines[1][6:]
                    try:
                        data = json.loads(data_str)
                        tool_name = data.get("tool")
                        tools_called.append(tool_name)

                        if tool_name == "fetch_webpage":
                            result = data.get("data", {})
                            if result.get("success"):
                                print(f"✅ Successfully fetched: {result.get('title')}")
                                print(f"   Content preview: {result.get('content', '')[:200]}...")
                            else:
                                print(f"❌ Fetch failed: {result.get('error')}")
                    except json.JSONDecodeError:
                        pass

        if "fetch_webpage" in tools_called:
            print("✅ Direct fetch_webpage call successful!")
        else:
            print("⚠️  fetch_webpage was not called for direct URL request")
            print(f"   Tools called: {tools_called}")

    except Exception as e:
        print(f"❌ Error: {e}")

    return True


if __name__ == "__main__":
    print("Starting agent + MCP integration test...")
    print("\nThis test will:")
    print("1. Start the MCP server subprocess")
    print("2. Have the agent search for information")
    print("3. Verify the agent fetches content from search results")
    print("4. Test direct URL fetching")

    # Run tests
    asyncio.run(test_agent_search_and_fetch())
    asyncio.run(test_simple_fetch())
