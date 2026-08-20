export interface ToolExecutionRequest {
  name: string;
  input: Any;
  runtime?: Record<string, unknown>;
}

export interface ToolExecutionContext {
  request: ToolExecutionRequest;
}

export type ToolExecutionHandler = (context: ToolExecutionContext) => Promise<Any>;
export type ToolExecutionMiddleware = (
  context: ToolExecutionContext,
  next: ToolExecutionHandler,
) => Promise<Any>;

export function composeToolMiddleware(
  handler: ToolExecutionHandler,
  middlewares: ToolExecutionMiddleware[],
): ToolExecutionHandler {
  return middlewares.reduceRight<ToolExecutionHandler>(
    (next, middleware) => async (context) => middleware(context, next),
    handler,
  );
}
