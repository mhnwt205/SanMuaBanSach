interface Env {
  API: { fetch(request: Request): Promise<Response> };
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) => env.API.fetch(request);
