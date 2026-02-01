import { defineMiddleware } from "astro:middleware";

/**
 * Middleware: redirects root path to login.
 * Protected routes (/images, /images/new, /images/[id]) rely on client-side
 * 401 handling (apiFetch redirect to /login). Session cookie is on backend
 * origin, so server-side auth check here is not possible without same-origin proxy.
 */
export const onRequest = defineMiddleware((context, next) => {
  if (context.url.pathname === "/" || context.url.pathname === "") {
    return context.redirect("/login");
  }
  return next();
});
