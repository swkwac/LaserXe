import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
  if (context.url.pathname === "/" || context.url.pathname === "") {
    return context.redirect("/grid-generator");
  }
  return next();
});
