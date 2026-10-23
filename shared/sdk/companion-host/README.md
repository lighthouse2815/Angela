# @angela/host-sdk

Host configuration, output, and approval helpers.

## Use

Import the package subpath owned by the feature. Applications retain startup and shutdown ownership.
Run `pnpm -F @angela/host-sdk build`, `typecheck`, or `test` from the repository root.

## Boundary

This package does not start an application when imported. Personal data stays outside the repository.
