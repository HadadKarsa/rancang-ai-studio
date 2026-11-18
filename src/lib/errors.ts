/**
 * Typed error hierarchy (02_ARCHITECTURE §5.5) — codes match 04_API §2.4.
 */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 500,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message, 404);
  }
}

export class DocumentNotFoundError extends AppError {
  constructor(type: string) {
    super('DOCUMENT_NOT_FOUND', `Unknown document type: ${type}`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', message, 409, details);
  }
}

export class DocumentLockedError extends AppError {
  constructor() {
    super('DOCUMENT_LOCKED', 'Document is locked', 409);
  }
}

export class InterviewAlreadyActiveError extends AppError {
  constructor() {
    super('INTERVIEW_ALREADY_ACTIVE', 'An interview session is already in progress', 409);
  }
}

export class ShareLinkExpiredError extends AppError {
  constructor() {
    super('SHARE_LINK_EXPIRED', 'Share link has expired', 410);
  }
}

export class ShareLinkRevokedError extends AppError {
  constructor() {
    super('SHARE_LINK_REVOKED', 'Share link has been revoked', 410);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload too large') {
    super('PAYLOAD_TOO_LARGE', message, 413);
  }
}

export class ProviderNotConfiguredError extends AppError {
  constructor(provider: string) {
    super('PROVIDER_NOT_CONFIGURED', `No API key on file for provider: ${provider}`, 422);
  }
}

export class ProviderKeyInvalidError extends AppError {
  constructor(provider: string) {
    super('PROVIDER_KEY_INVALID', `Provider rejected the key: ${provider}`, 422);
  }
}

export class ModelNotAvailableError extends AppError {
  constructor(model: string) {
    super('MODEL_NOT_AVAILABLE', `Model not available: ${model}`, 422);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super('RATE_LIMITED', 'Rate limit exceeded', 429);
    this.details = { retryAfterSeconds };
  }
}

export class EncryptionError extends AppError {
  constructor(message = 'Encryption failure') {
    super('ENCRYPTION_ERROR', message, 500);
  }
}

export class ProviderError extends AppError {
  constructor(message: string, details?: unknown) {
    super('PROVIDER_ERROR', message, 502, details);
  }
}

export class GenerationInProgressError extends AppError {
  constructor() {
    super('GENERATION_IN_PROGRESS', 'A generation is already running for this document', 503);
  }
}
