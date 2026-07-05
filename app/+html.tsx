// Learn more https://docs.expo.dev/router/reference/static-rendering/#root-html

import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";

// Web-only root HTML, overriding @expo/cli's default template (which ships
// `user-scalable` unset, i.e. zoomable) — the Gym Floor's own pinch gesture
// (GymFloor3D's PanResponder, camera zoom/rotate) fought the browser's
// native pinch-to-zoom on the whole page for the same two-finger gesture,
// so the page zoomed instead of (or as well as) the 3D camera. `maximum-
// scale=1, user-scalable=no` hands that gesture entirely to the app.
export default function Root({ children }: { children: React.ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no"
        />

        <ScrollViewStyleReset />

        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
