---
name: enforce-rules-for-unocss
description: Enforce Angela's UnoCSS, Vue styling, shared UI component, animation, icon, and color-mode practices. Use when creating, editing, refactoring, or reviewing Vue templates, component styles, utility classes, UnoCSS configuration, animations, icons, UI primitives, shared/ui/primitives components, or VueUse dark-mode behavior in the Angela monorepo.
---

# Enforce Angela UnoCSS Rules

Apply these rules to every affected UI file in Angela.

## Compose Utility Classes Readably

- Prefer UnoCSS over Tailwind CSS.
- In Vue templates, bind grouped class arrays for readability:

  ```vue
  :class="[
    'px-2 py-1',
    'flex items-center',
    'bg-white/50 dark:bg-black/50',
  ]"
  ```

- Do not use long inline class strings such as `class="px-2 py-1 flex items-center bg-white/50 dark:bg-black/50"`.
- Do not use attributify-style groups such as `px="2" py="1" flex="~ items-center" bg="white/50 dark:black/50"`.
- If a component that you change has legacy utility classes, refactor those classes into readable grouped arrays in the same change.

## Reuse Project Styling Infrastructure

- Use or extend shortcuts and rules in `uno.config.ts` when styles should be standardized or reused.
- Search `apps/web/src/styles` for existing animations before adding one. Reuse or extend an existing animation when it fits.
- Consult `apps/web/tsconfig.json` and `uno.config.ts` when configuration context is needed.
- Keep animations intuitive, lively, and readable.

## Build on Shared UI Primitives

- Build primitives on `@angela/ui`, which is based on reka-ui, instead of raw DOM controls.
- Read `docs/ai/context/ui-components.md` for the component API and `shared/ui/primitives/src/components/Form` for implementation patterns.
- When adding or updating a component in `shared/ui/primitives`, update `docs/ai/context/ui-components.md` with its description, props, slots, and emits.
- Use Iconify icon sets instead of bespoke SVGs.

## Preserve Theme Behavior

- When using VueUse `useDark`, set `disableTransition: false` or use an existing composable from `shared/ui/primitives`.
