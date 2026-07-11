// connectors/openapi-parser.mjs
// 把 OpenAPI/Swagger spec 归一化为内部统一端点结构。

export function normalizeOpenApiSpec(spec) {
  const endpoints = [];
  for (const [path, methods] of Object.entries(spec?.paths || {})) {
    for (const [method, operation] of Object.entries(methods || {})) {
      if (typeof operation !== 'object' || operation == null) continue;
      endpoints.push({
        path,
        method: method.toUpperCase(),
        summary: operation.summary || '',
        description: operation.description || '',
        tags: Array.isArray(operation.tags) ? operation.tags : [],
        parameters: operation.parameters || [],
        requestBody: operation.requestBody || null
      });
    }
  }
  return { endpoints, info: spec?.info || {} };
}