import { defineMiddleware } from "astro:middleware";
import { isValidSessionToken, ADMIN_COOKIE_NAME } from "./lib/admin-auth";

// Protège tout /admin/* (sauf la page de connexion elle-même) : sans
// cookie de session valide, redirection vers /admin/login. Centralisé ici
// plutôt que dupliqué dans chaque page admin.
export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;

  const isAdminRoute = url.pathname.startsWith("/admin");
  const isLoginRoute = url.pathname === "/admin/login";

  if (isAdminRoute && !isLoginRoute) {
    const token = cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (!isValidSessionToken(token)) {
      return redirect("/admin/login");
    }
  }

  return next();
});
