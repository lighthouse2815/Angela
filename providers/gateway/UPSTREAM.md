# Gateway source ownership

Angela owns the package and CLI integration in this directory.
The provider engine imported from decolua/9router lives in `vendor/` and uses its own locked dependencies.
Read [the source record](vendor/README.angela.md) for the upstream revision and local changes.
The imported license is retained in [vendor/NOTICE](vendor/NOTICE).
Run `pnpm -F @angela/gateway build` to rebuild the portable server in `dist/`.
