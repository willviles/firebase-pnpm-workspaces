# firebase-pnpm-workspaces

*** ⚠️ **This project is now archived. Please consider using [isolate-package](https://github.com/0x80/isolate-package) instead.** ***

PNPM workspaces + Firebase deployments made easy.

## Problem

Firebase functions [does not support deployment of dependencies from a monorepo structure](https://github.com/firebase/firebase-tools/issues/653). To use dependencies which are not published to a registry, dependency code must be copied into the `functions` directory & referenced accordingly, prior to running `firebase deploy --functions`.

## Solution

```bash
npx firebase-pnpm-workspaces --filter <FIREBASE_FUNCTIONS_WORKSPACE_NAME>
```

This command, run at the root of your monorepo:

1. Automatically builds a pnpm dependency graph of workspaces used in your firebase functions `package.json`
2. Copies all necessary package code into a `.firebase-pnpm-workspaces` tmp folder inside your firebase functions workspace
3. Modifies `package.json` in firebase functions workspace and in all nested dependencies to point to `file:` references

> NOTE: Rollback of package.json changes is still TODO. Recommended use is currently **only in an ephemeral environment**, such as CI or in a pruned Turborepo 'out' folder (see examples)

## Options

| Flag | Alias | Default | Required? | Description |
| - | - | - | - | - |
| --filter | -F | - | ✅ | Firebase functions workspace name. <br /> Example: <br /> `--scope functions`
| --dir | -d | `process.cwd()` | ❌ | Path to workspace root  <br /> Example: <br /> `--dir ./out`
| --tmpDir | -t | `.firebase-pnpm-workspaces` | ❌ | Custom tmp directory folder where dependency packages will be placed  <br /> Example: <br /> `--tmpDir custom-tmp-folder`

## Examples

### Local pruned Turborepo

A simple shell script, which:

- Prunes & builds your Turborepo into a clean `/out` dir
- Installs dependencies
- Copies & links packages via relative file path replacement in package.json
- Deploys to Firebase

```bash
#!/bin/sh
cd $PATH_TO_TURBOREPO_ROOT

echo 'Creating a pruned Turborepo'
pnpm turbo prune --scope=$FUNCTIONS_PACKAGE_NAME

echo 'Copying Firebase config'
cp ./{.firebaserc,firebase.json} ./out

cd ./out

echo 'Installing dependencies'
pnpm install

echo 'Running Turbo build'
pnpm turbo run build --filter=$FUNCTIONS_PACKAGE_NAME --include-dependencies --no-deps --no-cache

echo 'Running firebase-pnpm-workspaces'
pnpm dlx firebase-pnpm-workspaces --filter=$FUNCTIONS_PACKAGE_NAME

echo 'Resolve new package locations'
pnpm i

echo 'Deploying'
firebase deploy --force --only functions

echo 'Cleaning up ./out folder'
rm -Rf ./out
```

### More examples soon:

- Vanilla CI via GitHub Actions (Link coming soon)
- Turborepo CI via GitHub Actions (Link coming soon)
