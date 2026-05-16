import { NextResponse } from "next/server";

export type ApiResponse<T = unknown> =
  | { success: true; message: string; data: T }
  | { success: false; message: string; error: string; data: null };

export function successResponse<T>(
  data: T,
  message: string = "Success"
): NextResponse<ApiResponse<T>> {
  return NextResponse.json({
    success: true,
    message,
    data,
  });
}

export function errorResponse(
  error: string,
  status: number = 400,
  message?: string
): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
    {
      success: false,
      message: message ?? error,
      error,
      data: null,
    },
    { status }
  );
}
