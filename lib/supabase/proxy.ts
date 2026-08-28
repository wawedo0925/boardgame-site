import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // 로그인 세션이 만료되기 전에 갱신하고,
  // 갱신된 쿠키를 브라우저 응답에 반영합니다.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const pathname = request.nextUrl.pathname;
  const isProfileSetupPath =
    pathname === "/mypage" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/");

  if (userId && !isProfileSetupPath) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("activity_name,birth_year,region,gender")
      .eq("id", userId)
      .maybeSingle();

    if (!profileError) {
      const hasCompleteActivityProfile = Boolean(
        profile?.activity_name?.trim() &&
          profile?.birth_year?.trim() &&
          profile?.region?.trim() &&
          profile?.gender?.trim(),
      );

      if (!hasCompleteActivityProfile) {
        const profileUrl = request.nextUrl.clone();
        profileUrl.pathname = "/mypage";
        profileUrl.search = "";
        profileUrl.searchParams.set("required", "profile");

        const redirectResponse = NextResponse.redirect(profileUrl);
        response.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie);
        });

        return redirectResponse;
      }
    }
  }

  return response;
}
