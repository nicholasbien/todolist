# OpenAI Responses API Guide

Complete guide to using OpenAI's Responses API (recommended for all new projects as of 2025).

## Table of Contents

- [Overview](#overview)
- [Basic Usage](#basic-usage)
- [Tool/Function Calling](#toolfunction-calling)
- [Streaming](#streaming)
- [Conversation State Management](#conversation-state-management)
- [Common Pitfalls](#common-pitfalls)
- [Migration from Chat Completions](#migration-from-chat-completions)

## Overview

The Responses API is OpenAI's recommended API released in March 2025. It combines the simplicity of Chat Completions with the agentic capabilities of the Assistants API.

### Why Use Responses API?

- ✅ **Stateful by design** - Conversation tracking built-in
- ✅ **Better with reasoning models** - GPT-5 series optimized for this API
- ✅ **Semantic streaming events** - 20+ event types for granular control
- ✅ **Built-in tools** - Web search, file search, code interpreter
- ✅ **Future-proof** - OpenAI's recommended API going forward

### Key Differences from Chat Completions

| Feature | Chat Completions | Responses API |
|---------|-----------------|---------------|
| Instructions | `messages[0].role = "system"` | `instructions` parameter |
| Message roles | `system`, `user`, `assistant` | `developer`, `user`, `assistant` |
| Tool results | `role: "tool"` | `type: "function_call_output"` |
| State management | Manual message array | Append to `input` array |

## Basic Usage

### Simple Text Generation

```python
from openai import OpenAI
client = OpenAI()

response = client.responses.create(
    model="gpt-5.1",
    instructions="You are a helpful assistant.",
    input="What is the capital of France?",
)

print(response.output_text)
```

### With Message History

```python
response = client.responses.create(
    model="gpt-5.1",
    instructions="You are a helpful assistant.",
    input=[
        {"role": "user", "content": "What is the capital of France?"},
        {"role": "assistant", "content": "The capital of France is Paris."},
        {"role": "user", "content": "What is its population?"},
    ],
)
```

## Tool/Function Calling

### Tool Schema Format

**IMPORTANT:** Responses API uses a **flat** tool format (not nested like Chat Completions).

```python
# ✅ CORRECT - Flat format
tools = [
    {
        "type": "function",
        "name": "get_weather",
        "description": "Get current weather for a location.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City name"
                }
            },
            "required": ["location"]
        }
    }
]

# ❌ WRONG - Nested format (Chat Completions)
tools = [
    {
        "type": "function",
        "function": {  # Don't nest under "function" key!
            "name": "get_weather",
            # ...
        }
    }
]
```

### Complete Tool Calling Pattern

The official pattern: **append to `input` array** (NOT `previous_response_id`).

```python
from openai import OpenAI
import json

client = OpenAI()

# Define tools
tools = [
    {
        "type": "function",
        "name": "get_weather",
        "description": "Get current weather.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string"}
            },
            "required": ["location"]
        }
    }
]

# 1. Initial request
input_list = [
    {"role": "user", "content": "What's the weather in Paris?"}
]

response = client.responses.create(
    model="gpt-5.1",
    tools=tools,
    input=input_list,
)

# 2. Append assistant's output (including function calls)
input_list += response.output

# 3. Execute tools and append results
for item in response.output:
    if item.type == "function_call":
        if item.name == "get_weather":
            # Execute your function
            result = get_weather(json.loads(item.arguments))

            # Append function call output
            input_list.append({
                "type": "function_call_output",
                "call_id": item.call_id,
                "output": json.dumps(result)
            })

# 4. Get final response
response = client.responses.create(
    model="gpt-5.1",
    tools=tools,
    input=input_list,
)

print(response.output_text)
```

### Key Points

1. **Append `response.output`** - Contains both text and function calls
2. **Use `type: "function_call_output"`** - Not `role: "tool"`
3. **Match `call_id`** - Use `item.call_id` from the function call
4. **Send full `input` array** - Include entire conversation history

## Streaming

### Event Types

The Responses API provides semantic streaming events:

| Event Type | Description |
|------------|-------------|
| `response.created` | Response generation started |
| `response.output_text.delta` | Text content chunk |
| `response.function_call_arguments.delta` | Function arguments streaming |
| `response.output_item.done` | Complete output item (has function name, call_id) |
| `response.completed` | Response finished (includes usage stats) |
| `error` | Error occurred |

### Streaming Example

```python
stream = await client.responses.create(
    model="gpt-5.1",
    input=[{"role": "user", "content": "Hello!"}],
    stream=True,
)

async for event in stream:
    event_type = event.type

    if event_type == "response.output_text.delta":
        print(event.delta, end="", flush=True)

    elif event_type == "response.completed":
        print(f"\nUsage: {event.usage.total_tokens} tokens")
```

### Tool Call Streaming Pattern

```python
partial_tool_calls = {}
current_tool_call_id = None

async for event in stream:
    event_type = event.type

    # Collect argument deltas
    if event_type == "response.function_call_arguments.delta":
        if hasattr(event, "item_id"):
            current_tool_call_id = event.item_id
            if current_tool_call_id not in partial_tool_calls:
                partial_tool_calls[current_tool_call_id] = {
                    "name": "",
                    "arguments": "",
                }
        if hasattr(event, "delta"):
            partial_tool_calls[current_tool_call_id]["arguments"] += event.delta

    # Get function name and call_id
    elif event_type == "response.output_item.done":
        if hasattr(event, "item") and event.item.type == "function_call":
            call_id = event.item.id
            partial_tool_calls[call_id]["name"] = event.item.name
            partial_tool_calls[call_id]["call_id"] = event.item.call_id
            partial_tool_calls[call_id]["arguments"] = event.item.arguments
```

**Key Attributes:**
- `event.item_id` - Item identifier (for tracking during streaming)
- `event.item.call_id` - Call ID to use in `function_call_output`
- `event.item.name` - Function name
- `event.item.arguments` - Complete arguments (on `done` event)

## Conversation State Management

### ✅ CORRECT Pattern: Append to Input Array

```python
input_messages = [
    {"role": "user", "content": "What are my tasks?"}
]

# Call 1: Model decides to call list_tasks
response = client.responses.create(
    model="gpt-5.1",
    input=input_messages,
    tools=tools
)

# Append assistant's output
input_messages += response.output

# Execute tool
for item in response.output:
    if item.type == "function_call":
        result = execute_tool(item.name, item.arguments)
        input_messages.append({
            "type": "function_call_output",
            "call_id": item.call_id,
            "output": json.dumps(result)
        })

# Call 2: Model generates final response with tool results
response = client.responses.create(
    model="gpt-5.1",
    input=input_messages,  # Full conversation history
    tools=tools
)
```

### ❌ WRONG Pattern: Using previous_response_id

```python
# DON'T DO THIS (causes repeated tool calls)
response = client.responses.create(
    input=[{"type": "function_call_output", ...}],
    previous_response_id=response.id  # ❌ Wrong approach
)
```

**Why wrong?** The `previous_response_id` approach is meant for different use cases. For tool calling, always append to the `input` array.

## Common Pitfalls

### 1. Nested Tool Format

**Problem:**
```python
# ❌ WRONG
{"type": "function", "function": {"name": "...", ...}}
```

**Solution:**
```python
# ✅ CORRECT
{"type": "function", "name": "...", "description": "...", "parameters": {...}}
```

### 2. Using role: "tool"

**Problem:**
```python
# ❌ WRONG - Chat Completions format
{"role": "tool", "tool_call_id": "...", "content": "..."}
```

**Solution:**
```python
# ✅ CORRECT - Responses API format
{"type": "function_call_output", "call_id": "...", "output": "..."}
```

### 3. Wrong call_id

**Problem:**
```python
# ❌ Using item.id instead of item.call_id
{"call_id": event.item.id}  # Wrong!
```

**Solution:**
```python
# ✅ Use item.call_id
{"call_id": event.item.call_id}
```

### 4. Not Appending Response Output

**Problem:**
```python
# ❌ Only appending tool results
input_messages.append({"type": "function_call_output", ...})
```

**Solution:**
```python
# ✅ Append BOTH assistant output AND tool results
input_messages += response.output  # Assistant's function calls
input_messages.append({"type": "function_call_output", ...})  # Your results
```

### 5. Clearing State Too Early

**Problem:**
```python
# ❌ Clearing before using
function_call_outputs = [...]
request["input"] = function_call_outputs
function_call_outputs = []  # Cleared too early!
```

**Solution:**
```python
# ✅ Clear after using
request["input"] = function_call_outputs
# Use request first...
function_call_outputs = []  # Clear after
```

## Migration from Chat Completions

### API Calls

```python
# Before: Chat Completions
response = client.chat.completions.create(
    model="gpt-4.1",
    messages=[
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Hello"}
    ]
)
text = response.choices[0].message.content

# After: Responses API
response = client.responses.create(
    model="gpt-5.1",
    instructions="You are helpful.",
    input=[{"role": "user", "content": "Hello"}]
)
text = response.output_text
```

### Streaming

```python
# Before: Chat Completions
async for chunk in stream:
    if chunk.choices[0].delta.content:
        token = chunk.choices[0].delta.content

# After: Responses API
async for event in stream:
    if event.type == "response.output_text.delta":
        token = event.delta
```

### Tool Results

```python
# Before: Chat Completions
messages.append({
    "role": "tool",
    "tool_call_id": call_id,
    "content": result
})

# After: Responses API
input_messages.append({
    "type": "function_call_output",
    "call_id": call_id,
    "output": result
})
```

## Best Practices

1. **Use GPT-5 models** - They're optimized for Responses API
2. **Append full output** - Use `input += response.output` pattern
3. **Match call_id exactly** - Use `item.call_id` from the response
4. **Log events during development** - Understand the event flow
5. **Handle errors gracefully** - Check for error events in streams
6. **Test tool calling thoroughly** - Verify the full loop works

## Resources

- [Official OpenAI Responses API Docs](https://platform.openai.com/docs/api-reference/responses)
- [Function Calling Guide](https://platform.openai.com/docs/guides/function-calling?api-mode=responses)
- [Streaming Guide](https://platform.openai.com/docs/guides/streaming-responses)
- [OpenAI Cookbook - Function Calling](https://cookbook.openai.com/examples/reasoning_function_calls)

## Example: Complete Agent Loop

See `backend/agent/agent.py` for a complete implementation including:
- Streaming with multiple tool calls
- Proper state management
- Error handling
- Token tracking
- Multi-turn conversations

---

**Last Updated:** 2025-11-23
**API Version:** OpenAI Responses API (March 2025)
