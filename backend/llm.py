import os
import json
import asyncio
from typing import List, Type, TypeVar, Optional
from pydantic import BaseModel
from anthropic import AsyncAnthropic

# Initialize Anthropic client
# Assumes ANTHROPIC_API_KEY is set in environment
client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Semaphore to limit concurrent API calls and avoid rate limiting
# Max 3 concurrent requests to Anthropic API (conservatively set to avoid 429s)
_api_semaphore = asyncio.Semaphore(4)

# Simple in-memory cache to avoid redundant calls
# Key: hash of (model, str(messages), temperature, max_tokens)
# Value: response content
_response_cache = {}

def _get_cache_key(messages: List[dict], model: str, temperature: float, max_tokens: int) -> str:
    # Create a stable string representation of messages for hashing
    msg_str = json.dumps(messages, sort_keys=True)
    return f"{model}|{msg_str}|{temperature}|{max_tokens}"

T = TypeVar('T', bound=BaseModel)

async def call_llm(
    messages: List[dict],
    model: str = "claude-3-5-haiku-20241022",  # Haiku for speed
    temperature: float = 0.0,
    max_tokens: int = 1024
) -> str:
    """
    Straightforward LLM call - messages passed directly to Anthropic.
    Handles system messages by extracting them to the system parameter.
    Uses semaphore to limit concurrent API calls.
    Includes in-memory caching.
    """
    cache_key = _get_cache_key(messages, model, temperature, max_tokens)
    if cache_key in _response_cache:
        print("⚡ Serving from cache")
        return _response_cache[cache_key]

    async with _api_semaphore:
        try:
            # Extract system messages from messages array (Anthropic requires them as a separate parameter)
            system_messages = [msg["content"] for msg in messages if msg.get("role") == "system"]
            user_messages = [msg for msg in messages if msg.get("role") != "system"]

            # Combine system messages
            system_msg = "\n\n".join(system_messages) if system_messages else None

            if system_msg:
                response = await client.messages.create(
                    model=model,
                    system=system_msg,
                    messages=user_messages,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
            else:
                response = await client.messages.create(
                    model=model,
                    messages=user_messages,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
            
            content = response.content[0].text
            _response_cache[cache_key] = content
            return content
        except Exception as e:
            print(f"LLM Call Error: {e}")
            return ""

async def call_structured_llm(
    messages: List[dict],
    response_model: Type[T],
    model: str = "claude-3-5-haiku-20241022",
    temperature: float = 0.0,
    max_tokens: int = 1024
) -> Optional[T]:
    """
    Structured completion using JSON mode with Anthropic.
    Extracts system messages from the messages array and passes them as a separate system parameter.
    Uses semaphore to limit concurrent API calls.
    Includes in-memory caching.
    """
    # Note: For structured output, we cache the RAW JSON string, not the parsed object, 
    # but since we return the object, we'll cache the object reconstruction might be needed if we cache at this level.
    # Actually, simpler to cache the underlying text response if we extracted logic, but here we'll just cache the result if possible?
    # No, we can't easily cache the Pydantic object across runs without pickling. 
    # Let's cache the raw response string in a separate cache or reuse the logic.
    # To keep it simple and safe, we will implement caching logic inside here too.
    
    cache_key = _get_cache_key(messages, model, temperature, max_tokens) + f"|{response_model.__name__}"
    
    # Check cache (we store the raw JSON string)
    if cache_key in _response_cache:
        try:
            print("⚡ Serving from cache (structured)")
            return response_model.model_validate_json(_response_cache[cache_key])
        except Exception:
            # If validation fails (schema changed?), invalidate
            del _response_cache[cache_key]

    async with _api_semaphore:
        try:
            # Extract system messages from messages array (Anthropic requires them as a separate parameter)
            system_messages = [msg["content"] for msg in messages if msg.get("role") == "system"]
            user_messages = [msg for msg in messages if msg.get("role") != "system"]
            
            # Add instruction to return JSON matching the schema
            schema = response_model.model_json_schema()
            schema_instruction = f"\n\nRespond with valid JSON matching this schema: {json.dumps(schema)}"
            
            # Combine system messages
            if system_messages:
                system_msg = "\n\n".join(system_messages) + schema_instruction
            else:
                system_msg = "You are a helpful AI assistant." + schema_instruction
            
            response = await client.messages.create(
                model=model,
                system=system_msg,
                messages=user_messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            
            json_str = response.content[0].text

            # Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
            json_str = json_str.strip()
            if json_str.startswith("```json"):
                json_str = json_str[7:]  # Remove ```json
            elif json_str.startswith("```"):
                json_str = json_str[3:]  # Remove ```
            if json_str.endswith("```"):
                json_str = json_str[:-3]  # Remove trailing ```
            json_str = json_str.strip()

            # Extract only the JSON object (handle trailing text after JSON)
            # Find the matching closing brace for the opening brace
            if json_str.startswith("{"):
                brace_count = 0
                json_end = 0
                for i, char in enumerate(json_str):
                    if char == "{":
                        brace_count += 1
                    elif char == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            json_end = i + 1
                            break
                if json_end > 0:
                    json_str = json_str[:json_end]

            # Validate and cache
            result = response_model.model_validate_json(json_str)
            _response_cache[cache_key] = json_str
            return result
        except Exception as e:
            print(f"[LLM ERROR] Structured LLM Call Error: {e}")
            import traceback
            traceback.print_exc()
            return None

