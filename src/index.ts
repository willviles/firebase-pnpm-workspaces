#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { execa } from 'execa'
import path from 'node:path'
import fs from 'fs-extra'

const argv = await yargs(hideBin(process.argv)).options({
  dir: { alias: 'd', type: 'string', default: process.cwd() },
  filter: { alias: 'F', type: 'string' },
  tmpDir: { alias: 't', type: 'string', default: '.firebase-pnpm-workspaces' }
}).argv

try {
  argv.dir = path.resolve(argv.dir)
} catch (err) {
  console.error(err)
  process.exit(1)
}

interface DependenciesInfo {
  [key: string]: {
    from: string
    version: string
  }
}

async function getPNPMWorkspaceInfo (filter: string) {
  const { stdout } = await execa('pnpm', ['ls', `--filter=${filter}`, '--depth', '0', '--json'], { cwd: argv.dir })
  const workspaceInfo: {
    name: string
    path: string
    dependencies: DependenciesInfo
    devDependencies: DependenciesInfo
  } = JSON.parse(stdout)[0]

  const allDependencies = Object.entries({ ...workspaceInfo.dependencies, ...workspaceInfo.devDependencies })
  const dependencyWorkspaces = allDependencies.filter(([, { version }]) => version.includes('link:'))

  return {
    ...workspaceInfo,
    allDependencies,
    dependencyWorkspaces
  }
}

async function findDependencies (filter: string, obj = {}): Promise<Record<string, { path: string }>> {
  const { path: workspacePath, dependencyWorkspaces } = await getPNPMWorkspaceInfo(filter)

  for (const [workspaceName, { version }] of dependencyWorkspaces) {
    if (!!obj[workspaceName]) {
      continue
    } else {
      obj[workspaceName] = {
        path: path.join(workspacePath, version.replace('link:', ''))
      }
      obj = {
        ...await findDependencies(workspaceName, obj)
      }
    }
  }

  return obj
}

try {
  if (!argv.filter) {
    throw new Error('No filter provided')
  }

  const workspaceInfo = await getPNPMWorkspaceInfo(argv.filter)
  const dependentWorkspaces = await findDependencies(argv.filter)

  const tmpDirPath = path.join(workspaceInfo.path, argv.tmpDir)

  // Ensure tmp dir exists
  await fs.ensureDir(tmpDirPath)

  // Copy all dependency workspaces to tmp
  await Promise.all(
    Object.entries(dependentWorkspaces).map(async ([name, info]) => {
      const dest = path.join(tmpDirPath, name)
      await fs.ensureDir(dest)
      return await fs.copy(info.path, dest)
    })
  )

  // Modify all package.json files with file refs
  async function modifyPackageJson (packageDir: string) {
    const packageJsonPath = path.join(packageDir, 'package.json')
    const packageJson = await fs.readJson(packageJsonPath)

    for (const depListType of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const depList = packageJson[depListType]
      if (depList) {
        packageJson[depListType] = (() => {
          for (const dependencyName of Object.keys(dependentWorkspaces)) {
            if (!!depList[dependencyName]) {
              depList[dependencyName] = `file:${path.relative(packageDir, path.join(tmpDirPath, dependencyName))}`
            }
          }
          return depList
        })()
      }
    }

    return await fs.writeJson(packageJsonPath, packageJson, { spaces: 2, EOL: '\n' })
  }

  await Promise.all([
    modifyPackageJson(workspaceInfo.path),
    ...Object.keys(dependentWorkspaces).map(async (name) => {
      const dest = path.join(tmpDirPath, name)
      return await modifyPackageJson(dest)
    })
  ])
} catch (err) {
  console.error(err)
  process.exit(1)
}
