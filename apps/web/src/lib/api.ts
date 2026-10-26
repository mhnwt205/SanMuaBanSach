export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      0,
      'Chưa kết nối được với máy chủ. Vui lòng kiểm tra mạng và thử lại.',
    );
  }
  let data: T & { error?: string };
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      'Phản hồi chưa hợp lệ. Vui lòng thử lại sau.',
    );
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error ?? 'Không thực hiện được thao tác. Vui lòng thử lại.',
    );
  return data;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
