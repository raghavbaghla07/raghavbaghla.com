# raghavbaghla.com

The personal website of Raghav Baghla.

Built with Astro, a strict TypeScript configuration, and plain CSS. The opening
page is static HTML with CSS animation and no browser JavaScript or external fonts.
“Hii” appears once, then disappears before the smaller name introduction appears
in the same centered position. Reduced-motion preferences show the name immediately.

## Development

Use Node.js 24 LTS.

```sh
npm install
npm run dev
```

## Production

```sh
npm run build
npm run preview
```

Deploy the generated `dist/` folder to a static host. The production domain is
configured in `astro.config.mjs`.

## Website brief

- Introduce Raghav Baghla, opening with “Hii,” followed by “I am Raghav Baghla.”
- Share daily learnings and book notes.
- Showcase creative ad copy and artwork.
- Support book recommendations and affiliate links.
- Use a premium black background with white or off-white text.

Only the opening introduction is implemented so far. The existing Vercel project
deploys from `main`; `vercel.json` explicitly selects Astro and the static `dist/`
output, replacing the previous Next.js build settings.
