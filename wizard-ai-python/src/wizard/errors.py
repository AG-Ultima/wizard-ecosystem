"""Custom exceptions for Wizard.AI SDK"""

class WizardError(Exception):
    """Base exception for all Wizard.AI errors"""
    pass

class AuthenticationError(WizardError):
    """Raised when API key is invalid or missing"""
    pass

class APIError(WizardError):
    """Raised when API returns an error response"""
    pass

class RateLimitError(WizardError):
    """Raised when rate limit is exceeded"""
    pass

class InvalidRequestError(WizardError):
    """Raised when request parameters are invalid"""
    pass
