import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

function getSafeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//") || /[\\\r\n]/.test(nextPath)) {
    return "/";
  }

  return nextPath;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (requestUrl.searchParams.has("error")) {
    const errorUrl = new URL("/login", requestUrl.origin);
    errorUrl.searchParams.set("error", "카카오 로그인이 완료되지 않았습니다. 다시 로그인해 주세요.");
    return NextResponse.redirect(errorUrl);
  }

  if (!code) {
    const errorUrl = new URL("/login", requestUrl.origin);
    errorUrl.searchParams.set(
      "error",
      "카카오 로그인 인증 코드를 받지 못했습니다."
    );

    return NextResponse.redirect(errorUrl);
  }

  const supabase = await createClient();
  const flowId = requestUrl.searchParams.get("sb_flow_id");
  const { error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  );

  if (error) {
    // Do not log the callback URL, authorization code, cookies, or tokens.
    console.error("OAuth code exchange failed", {
      name: error.name,
      code: error.code,
      status: error.status,
    });
    const missingVerifier = error.name === "AuthPKCECodeVerifierMissingError" ||
      error.code === "flow_state_not_found";
    const expiredCode = error.code === "flow_state_expired" ||
      error.code === "bad_code_verifier";
    const errorUrl = new URL("/login", requestUrl.origin);
    errorUrl.searchParams.set(
      "error",
      missingVerifier
        ? "로그인을 시작한 브라우저의 인증 정보를 찾지 못했습니다. 같은 브라우저와 사이트 주소에서 카카오 로그인을 다시 시작해 주세요."
        : expiredCode
          ? "로그인 인증이 만료되었거나 이전 요청과 일치하지 않습니다. 아래 버튼으로 카카오 로그인을 다시 시작해 주세요."
          : "로그인 정보를 저장하지 못했습니다. 아래 버튼으로 다시 시도해 주세요. 반복되면 관리자에게 문의해 주세요."
    );

    return NextResponse.redirect(errorUrl);
  }

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
