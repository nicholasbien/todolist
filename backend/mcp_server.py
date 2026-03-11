#!/usr/bin/env python3
"""Working MCP server using FastMCP from the official SDK."""

import logging
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create the FastMCP server
mcp = FastMCP("todolist-web")


@mcp.tool()
async def fetch_webpage(url: str, selector: Optional[str] = None) -> dict:
    """
    Fetch and extract content from a webpage.

    Args:
        url: The URL to fetch
        selector: Optional CSS selector to extract specific content

    Returns:
        Dict with extracted content
    """
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()

            # Parse HTML
            soup = BeautifulSoup(response.text, "html.parser")

            # Extract content based on selector
            if selector:
                elements = soup.select(selector)
                if elements:
                    content = "\n".join(
                        [elem.get_text(strip=True) for elem in elements]
                    )
                else:
                    content = f"No elements found matching selector: {selector}"
            else:
                # Remove script and style elements
                for script in soup(["script", "style"]):
                    script.decompose()

                # Get main content
                main_content = (
                    soup.find("main") or soup.find("article") or soup.find("body")
                )
                content = (
                    main_content.get_text(separator="\n", strip=True)
                    if main_content
                    else ""
                )

            # Get title
            title = soup.find("title")
            title_text = title.get_text(strip=True) if title else "No title"

            # Get meta description
            meta_desc = soup.find("meta", attrs={"name": "description"})
            description = meta_desc.get("content", "") if meta_desc else ""

            return {
                "success": True,
                "url": str(response.url),
                "status_code": response.status_code,
                "title": title_text,
                "description": description,
                "content": content[:5000],  # Limit content size
                "content_length": len(content),
                "selector_used": selector,
            }

    except httpx.HTTPStatusError as e:
        return {
            "success": False,
            "error": f"HTTP {e.response.status_code}: {e.response.reason_phrase}",
            "url": url,
        }
    except Exception as e:
        logger.error(f"Error fetching {url}: {e}")
        return {"success": False, "error": str(e), "url": url}


@mcp.tool()
async def fetch_json(url: str) -> dict:
    """
    Fetch JSON data from an API endpoint.

    Args:
        url: The API URL to fetch

    Returns:
        Dict with the JSON response or error
    """
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url)
            response.raise_for_status()

            return {
                "success": True,
                "url": str(response.url),
                "status_code": response.status_code,
                "data": response.json(),
            }

    except httpx.HTTPStatusError as e:
        return {
            "success": False,
            "error": f"HTTP {e.response.status_code}: {e.response.reason_phrase}",
            "url": url,
        }
    except Exception as e:
        logger.error(f"Error fetching JSON from {url}: {e}")
        return {"success": False, "error": str(e), "url": url}


@mcp.tool()
async def extract_links(url: str, pattern: Optional[str] = None) -> dict:
    """
    Extract all links from a webpage.

    Args:
        url: The URL to extract links from
        pattern: Optional pattern to filter links (e.g., contains this string)

    Returns:
        Dict with extracted links
    """
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            # Extract all links
            links = []
            for link in soup.find_all("a", href=True):
                href = link["href"]
                text = link.get_text(strip=True)

                # Make absolute URL
                if href.startswith("/"):
                    from urllib.parse import urljoin

                    href = urljoin(str(response.url), href)

                # Filter by pattern if provided
                if (
                    pattern
                    and pattern.lower() not in href.lower()
                    and pattern.lower() not in text.lower()
                ):
                    continue

                links.append({"url": href, "text": text[:100]})  # Limit text length

            return {
                "success": True,
                "url": str(response.url),
                "links": links[:100],  # Limit number of links
                "total_links": len(links),
                "pattern": pattern,
            }

    except Exception as e:
        logger.error(f"Error extracting links from {url}: {e}")
        return {"success": False, "error": str(e), "url": url}


if __name__ == "__main__":
    print("=" * 60)
    print("TodoList MCP Server - Web Content Fetching")
    print("=" * 60)
    print("\nAvailable tools:")
    print("  • fetch_webpage: Extract content from any webpage")
    print("  • fetch_json: Fetch JSON from APIs")
    print("  • extract_links: Extract all links from a page")
    print("\nNote: Web search is handled by Brave API in the main agent")
    print("\nServer running on stdio transport...")
    print("=" * 60)

    # Run the server
    mcp.run()
