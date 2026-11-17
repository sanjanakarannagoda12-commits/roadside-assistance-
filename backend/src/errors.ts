// One error shape for every failure the app can receive:
// { "error": { "code": "validation_error", "message": "...", "fields": { "fullName": "..." } } }
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function zodToFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
    return;
  }
  if (err instanceof ZodError) {
    const fields = zodToFields(err);
    res.status(400).json({
      error: { code: 'validation_error', message: Object.values(fields)[0] ?? 'Invalid input', fields },
    });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB)' : err.message;
    res.status(400).json({ error: { code: 'invalid_file', message } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
};
