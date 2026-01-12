import { NextResponse } from "next/server";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
}

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
  message: string,
  status: number = 400
): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
    {
      success: false,
      message,
      data: null,
    },
    { status }
  );
}
