# Shared Packages Policy

**DO NOT create new shared packages immediately.**

## Default Behavior

Keep code in the app where it's first needed.

## When to Consider Sharing

Only when ALL of these are true:

- Same code exists (or will exist) in 2+ apps
- Code is stable and unlikely to diverge
- User has explicitly requested it

## Before Creating a Package

Always ask the user for permission. Justify with:

- Which apps will use it
- What specific code will be shared
- Why duplication is problematic