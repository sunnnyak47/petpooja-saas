#!/usr/bin/env node
/**
 * verify-release.js — release guard for the desktop app.
 *
 * Two independent checks, both of which FAIL LOUDLY (non-zero exit) so a broken
 * or stale release can never ship silently:
 *
 *   1. DMG-per-arch presence.  electron-builder is configured to emit a macOS
 *      DMG for every arch in package.json → build.mac (dmg target). If a build
 *      silently drops one arch (the classic "only the .dmg.blockmap, no .dmg"
 *      symptom when a per-arch step fails but the process still exits 0), this
 *      check catches the missing DMG and exits non-zero.
 *
 *   2. Auto-update manifest freshness.  electron-updater manifests
 *      (latest-mac.yml / latest.yml / latest-linux.yml) carry a `version:` that
 *      MUST equal package.json → version. When the manifest drifts to an older
 *      version than the package, updaters ship a stale pointer. This check
 *      compares every manifest found in dist/ against package.json and fails on
 *      any mismatch.
 *
 * Usage:
 *   node scripts/verify-release.js            # both checks (post-build / pre-publish)
 *   node scripts/verify-release.js --dmg      # DMG presence only
 *   node scripts/verify-release.js --manifest # manifest freshness only (release guard)
 *
 * Exit code 0 = all requested checks passed; 1 = at least one failed.
 */

'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

const args = process.argv.slice(2)
const wantDmg = args.length === 0 || args.includes('--dmg')
const wantManifest = args.length === 0 || args.includes('--manifest')

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const VERSION = pkg.version
const errors = []
const notes = []

function listDist() {
  try {
    return fs.readdirSync(DIST)
  } catch (_) {
    return null // dist/ does not exist yet
  }
}

/**
 * Which macOS arches the config promises a DMG for.
 * Reads package.json → build.mac.target, keeping only the dmg target's arch(es).
 */
function expectedMacDmgArches() {
  const targets = pkg.build && pkg.build.mac && pkg.build.mac.target
  if (!Array.isArray(targets)) return []
  const arches = []
  for (const t of targets) {
    if (typeof t === 'object' && t && t.target === 'dmg' && Array.isArray(t.arch)) {
      for (const a of t.arch) if (!arches.includes(a)) arches.push(a)
    }
  }
  return arches
}

function checkDmgs() {
  const files = listDist()
  if (files === null) {
    errors.push(`No dist/ directory at ${DIST} — nothing was built. Run the build before verifying.`)
    return
  }
  const dmgs = files.filter((f) => f.endsWith('.dmg'))
  const arches = expectedMacDmgArches()

  if (arches.length === 0) {
    notes.push('No macOS DMG arches declared in build.mac.target — skipping DMG presence check.')
    return
  }

  // A universal build satisfies every arch requirement at once.
  const hasUniversal = dmgs.some((f) => f.includes('-universal') && f.includes(VERSION))

  for (const arch of arches) {
    // artifactName is `${name}-${version}-${arch}.${ext}`, but match loosely on
    // version + arch so a productName / artifactName tweak doesn't break the guard.
    const matched = dmgs.some((f) => f.includes(VERSION) && f.includes(`-${arch}.dmg`))
    if (matched || hasUniversal) {
      notes.push(`DMG present for ${arch}: ${hasUniversal ? '(universal)' : dmgs.find((f) => f.includes(`-${arch}.dmg`))}`)
    } else {
      // A blockmap with no DMG is the exact silent-failure symptom — call it out.
      const orphanBlockmap = files.some((f) => f.endsWith('.dmg.blockmap') && f.includes(`-${arch}`))
      errors.push(
        `Missing ${arch} DMG for v${VERSION} in dist/` +
        (orphanBlockmap ? ` (found a .dmg.blockmap but no .dmg — the ${arch} DMG step failed silently).` : '.') +
        ` Expected a file matching *-${VERSION}-${arch}.dmg (or a *-universal.dmg).`
      )
    }
  }

  if (dmgs.length) notes.push(`DMGs in dist/: ${dmgs.join(', ')}`)
}

function checkManifests() {
  const files = listDist()
  if (files === null) {
    // Not an error for a pure manifest run — there is simply nothing to validate yet.
    notes.push(`No dist/ directory at ${DIST} — no auto-update manifest to validate yet.`)
    return
  }
  const manifests = files.filter((f) => /^latest(-mac|-linux)?\.yml$/.test(f))
  if (manifests.length === 0) {
    notes.push('No latest*.yml auto-update manifests in dist/ — none to validate.')
    return
  }
  for (const name of manifests) {
    const text = fs.readFileSync(path.join(DIST, name), 'utf8')
    const m = text.match(/^version:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)
    if (!m) {
      errors.push(`${name}: no top-level "version:" field found — manifest is malformed.`)
      continue
    }
    const manifestVersion = m[1].trim()
    if (manifestVersion !== VERSION) {
      errors.push(
        `${name} is STALE: manifest version ${manifestVersion} != package.json version ${VERSION}. ` +
        `Regenerate the release build so the auto-update manifest points at v${VERSION}.`
      )
    } else {
      notes.push(`${name}: version ${manifestVersion} matches package.json ✓`)
    }
  }
}

console.log(`\n[verify-release] ${pkg.name} v${VERSION} — checks: ${[wantDmg && 'dmg', wantManifest && 'manifest'].filter(Boolean).join(', ')}`)

if (wantDmg) checkDmgs()
if (wantManifest) checkManifests()

for (const n of notes) console.log(`  · ${n}`)

if (errors.length) {
  console.error('\n[verify-release] ✗ FAILED:')
  for (const e of errors) console.error(`  ✗ ${e}`)
  console.error('')
  process.exit(1)
}

console.log('[verify-release] ✓ all checks passed\n')
