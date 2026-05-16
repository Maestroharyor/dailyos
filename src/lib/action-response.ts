export type ActionResponse<T = unknown> =
  | { success: true; message: string; data: T }
  | { success: false; message: string; error: string; data: null };

export function actionSuccess<T>(data: T, message = "Success"): ActionResponse<T> {
  return { success: true, message, data };
}

export function actionError(error: string | undefined, message?: string): ActionResponse<never> {
  const err = error ?? "An unexpected error occurred";
  return { success: false, message: message ?? err, error: err, data: null };
}
