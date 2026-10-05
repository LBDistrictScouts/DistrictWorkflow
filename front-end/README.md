# District Workflow front end

Standalone Next.js App Router application with TypeScript and React. The visual
language comes from `district-site`: Nunito Sans, the district logos, teal/green
palette, dark teal heroes, rounded cards, and light/dark themes. Assets are copied
locally so this app does not depend on the reference checkout at runtime.

## Run locally

```sh
cd front-end
nvm install
nvm use
corepack yarn install --immutable
corepack yarn dev
```

Open http://localhost:3000. Node 24 is selected by `.nvmrc`, and Yarn 4.18.1
matches the backend's package manager. The app runs independently of `../temporal`.

## Checks and production

```sh
corepack yarn lint
corepack yarn typecheck
corepack yarn build
corepack yarn start
```

## Structure and scope

- `src/app/page.tsx`: overview and entry points.
- `src/app/workflows/page.tsx`: workflow catalogue, initially empty.
- `src/app/help/page.tsx`: getting started guidance.
- `src/app/globals.css`: design tokens, shared styles, responsive layouts and themes.
- `src/components`: shared navigation and footer.
- `public`: local fonts, district logos and favicon reused from `district-site`.

This is the front-end foundation. Authentication, workflow execution, task forms
and live status are not implemented. There is no mock operational data and no
connection to Temporal yet. Add server-side integration when the real workflows
are defined; keep Temporal credentials and SDK access out of browser components.

The theme follows the device setting until manually changed, then stores the
preference locally. Navigation collapses on mobile; skip links, visible keyboard
focus and reduced-motion support are included.
