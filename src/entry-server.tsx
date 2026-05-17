// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

const app = createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="format-detection" content="telephone=no" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));

type SolidStartFetch = (request: Request, context?: unknown) => Response | Promise<Response>;

const fetch = app.fetch.bind(app) as SolidStartFetch;

const wrappedApp = {
  ...app,
  fetch(request: Request, context?: unknown) {
    if (typeof request.url === "string" && request.url.startsWith("/")) {
      const headers = new Headers(request.headers);
      const host = headers.get("host") || "localhost";
      const protocol = headers.get("x-forwarded-proto") || "https";

      return fetch(new Request(`${protocol}://${host}${request.url}`, request), context);
    }

    return fetch(request, context);
  }
};

export default wrappedApp;
