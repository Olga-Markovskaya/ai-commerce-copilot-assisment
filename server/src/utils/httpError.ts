export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = "HttpError";
  }

  static badRequest(message: string, cause?: Error): HttpError {
    return new HttpError(400, message, cause);
  }

  static notFound(message: string, cause?: Error): HttpError {
    return new HttpError(404, message, cause);
  }

  static internal(message: string, cause?: Error): HttpError {
    return new HttpError(500, message, cause);
  }
}