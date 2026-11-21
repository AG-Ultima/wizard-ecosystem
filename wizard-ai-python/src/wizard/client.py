"""
Wizard.AI Python Client Library
Official SDK for Wizard.AI API
Created by Arnav Gupta
"""

import requests
import json
import re
from typing import List, Dict, Optional, Union, Any, Generator
from .errors import AuthenticationError, APIError, RateLimitError, InvalidRequestError

__all__ = ['Wizard', 'ChatCompletions', 'Completion', 'StreamWrapper']


class Wizard:
    """
    Main Wizard.AI client
    """
    
    API_KEY_PATTERN = re.compile(r'^wiz_[A-Za-z0-9_-]{20,}$')
    
    def __init__(
        self, 
        api_key: str, 
        base_url: str = "https://arnav0928.pythonanywhere.com",
        timeout: int = 60,
        validate_key: bool = True
    ):
        if not api_key:
            raise ValueError("API key is required")
        
        self.api_key = api_key
        # Ensure base_url doesn't end with /v1
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        
        if validate_key:
            self._validate_api_key_format()
        
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": f"Wizard.AI-Python-SDK/{self._get_version()}"
        })
        
        self.chat = ChatCompletions(self)
    
    def _validate_api_key_format(self):
        if not self.API_KEY_PATTERN.match(self.api_key):
            raise AuthenticationError(
                "Invalid API key format. API keys should start with 'wiz_' and be at least 20 characters long."
            )
    
    def _get_version(self) -> str:
        try:
            from . import __version__
            return __version__
        except ImportError:
            return "unknown"
    
    def _request(
        self,
        method: str,
        endpoint: str,
        json_data: Optional[Dict] = None,
        stream: bool = False
    ) -> Union[Dict, Generator]:
        # ✅ FIXED: Proper URL construction - don't add extra slashes
        # Remove leading slash from endpoint if present, then join
        clean_endpoint = endpoint.lstrip('/')
        url = f"{self.base_url}/{clean_endpoint}"
        
        print(f"🔵 SDK Request: {method} {url}")  # Debug line
        
        if stream:
            return self._stream_request(method, url, json_data)
        
        try:
            response = self._session.request(
                method=method,
                url=url,
                json=json_data,
                timeout=self.timeout
            )
        except requests.exceptions.ConnectionError:
            raise APIError("Failed to connect to Wizard.AI API. Check your internet connection.")
        except requests.exceptions.Timeout:
            raise APIError(f"Request timed out after {self.timeout} seconds")
        except requests.exceptions.RequestException as e:
            raise APIError(f"Request failed: {str(e)}")
        
        print(f"🔵 SDK Response: {response.status_code}")  # Debug line
        
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 401:
            raise AuthenticationError("Invalid API key.")
        elif response.status_code == 403:
            raise AuthenticationError("API key does not have permission for this action.")
        elif response.status_code == 404:
            raise APIError(f"Endpoint not found: {endpoint} (URL: {url})")
        elif response.status_code == 429:
            raise RateLimitError("Rate limit exceeded. Please try again later.")
        elif response.status_code >= 500:
            raise APIError(f"Wizard.AI server error (HTTP {response.status_code}). Please try again later.")
        else:
            self._handle_error_response(response)
    
    def _stream_request(self, method: str, url: str, json_data: Optional[Dict] = None) -> Generator:
        try:
            response = self._session.request(
                method=method,
                url=url,
                json=json_data,
                stream=True,
                timeout=self.timeout
            )
        except requests.exceptions.RequestException as e:
            raise APIError(f"Streaming request failed: {str(e)}")
        
        if response.status_code != 200:
            if response.status_code == 401:
                raise AuthenticationError("Invalid API key")
            elif response.status_code == 429:
                raise RateLimitError("Rate limit exceeded")
            elif response.status_code >= 500:
                raise APIError(f"Server error (HTTP {response.status_code})")
            else:
                self._handle_error_response(response)
        
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data = line[6:]
                    if data == '[DONE]':
                        break
                    try:
                        yield json.loads(data)
                    except json.JSONDecodeError:
                        continue
    
    def _handle_error_response(self, response):
        try:
            error_data = response.json()
            error_msg = error_data.get('error', {}).get('message', 'Unknown error')
        except (json.JSONDecodeError, AttributeError):
            error_msg = f"HTTP {response.status_code}: {response.reason}"
        raise APIError(f"Wizard.AI API Error: {error_msg}")
    
    def list_models(self) -> List[Dict]:
        return self._request("GET", "v1/models").get('data', [])
    
    def validate_key(self) -> bool:
        try:
            self.list_models()
            return True
        except AuthenticationError:
            return False
    
    def close(self):
        self._session.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class ChatCompletions:
    """Chat completions endpoint handler"""
    
    def __init__(self, client: Wizard):
        self.client = client
    
    def create(
        self,
        messages: List[Dict[str, str]],
        model: str = "wizard-ai-pro",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        top_p: float = 1.0,
        frequency_penalty: float = 0.0,
        presence_penalty: float = 0.0,
        stop: Optional[Union[str, List[str]]] = None,
        stream: bool = False,
        **kwargs
    ) -> Union['Completion', 'StreamWrapper']:
        """Create a chat completion"""
        
        if not messages or not isinstance(messages, list):
            raise InvalidRequestError("Messages must be a non-empty list")
        
        for msg in messages:
            if not isinstance(msg, dict):
                raise InvalidRequestError("Each message must be a dictionary")
            if 'role' not in msg or 'content' not in msg:
                raise InvalidRequestError("Each message must have 'role' and 'content' keys")
            if msg['role'] not in ['system', 'user', 'assistant']:
                raise InvalidRequestError(f"Invalid role: {msg['role']}. Must be 'system', 'user', or 'assistant'")
        
        if not 0 <= temperature <= 2:
            raise InvalidRequestError("Temperature must be between 0 and 2")
        if not -2 <= frequency_penalty <= 2:
            raise InvalidRequestError("Frequency penalty must be between -2 and 2")
        if not -2 <= presence_penalty <= 2:
            raise InvalidRequestError("Presence penalty must be between -2 and 2")
        
        data = {
            "messages": messages,
            "model": model,
            "temperature": temperature,
            "top_p": top_p,
            "frequency_penalty": frequency_penalty,
            "presence_penalty": presence_penalty,
            "stream": stream,
            **kwargs
        }
        
        if max_tokens is not None:
            if max_tokens <= 0:
                raise InvalidRequestError("max_tokens must be positive")
            data["max_tokens"] = max_tokens
        
        if stop is not None:
            data["stop"] = stop
        
        # ✅ FIXED: Pass the full endpoint path (will be joined with base_url)
        response = self.client._request("POST", "v1/chat/completions", json_data=data, stream=stream)
        
        if stream:
            return StreamWrapper(response)
        
        return Completion(response)
    
    completions = create


class Completion:
    def __init__(self, data: Dict):
        self._data = data
        self.id = data.get('id')
        self.object = data.get('object')
        self.created = data.get('created')
        self.model = data.get('model')
        self.choices = [Choice(c) for c in data.get('choices', [])]
        self.usage = Usage(data.get('usage', {}))
    
    def __repr__(self):
        return f"<Completion id={self.id} model={self.model} tokens={self.usage.total_tokens}>"
    
    def __str__(self):
        if self.choices:
            return self.choices[0].message.content
        return ""


class Choice:
    def __init__(self, data: Dict):
        self.index = data.get('index')
        self.message = Message(data.get('message', {}))
        self.finish_reason = data.get('finish_reason')
    
    def __repr__(self):
        return f"<Choice index={self.index} finish_reason={self.finish_reason}>"


class Message:
    def __init__(self, data: Dict):
        self.role = data.get('role')
        self.content = data.get('content')
    
    def __repr__(self):
        return f"<Message role={self.role}>"
    
    def __str__(self):
        return self.content or ""


class Delta:
    def __init__(self, data: Dict):
        self.role = data.get('role')
        self.content = data.get('content')
    
    def __repr__(self):
        return f"<Delta content={self.content}>"


class StreamChoice:
    def __init__(self, data: Dict):
        self.index = data.get('index')
        self.delta = Delta(data.get('delta', {}))
        self.finish_reason = data.get('finish_reason')
    
    def __repr__(self):
        return f"<StreamChoice index={self.index}>"


class StreamWrapper:
    def __init__(self, generator):
        self.generator = generator
    
    def __iter__(self):
        return self
    
    def __next__(self):
        try:
            chunk = next(self.generator)
            return StreamChunk(chunk)
        except StopIteration:
            raise StopIteration
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


class StreamChunk:
    def __init__(self, data: Dict):
        self._data = data
        self.id = data.get('id')
        self.object = data.get('object')
        self.created = data.get('created')
        self.model = data.get('model')
        self.choices = [StreamChoice(c) for c in data.get('choices', [])]
    
    def __repr__(self):
        return f"<StreamChunk id={self.id}>"


class Usage:
    def __init__(self, data: Dict):
        self.prompt_tokens = data.get('prompt_tokens', 0)
        self.completion_tokens = data.get('completion_tokens', 0)
        self.total_tokens = data.get('total_tokens', 0)
    
    def __repr__(self):
        return f"<Usage total_tokens={self.total_tokens}>"