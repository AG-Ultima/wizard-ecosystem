"""Wizard.AI Python SDK - Official client for Wizard.AI API"""

from .client import Wizard
from .errors import AuthenticationError, APIError, RateLimitError

__version__ = "0.1.8"
__all__ = ["Wizard", "AuthenticationError", "APIError", "RateLimitError"]
