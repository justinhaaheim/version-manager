# CLAUDE.md

## Project Overview

@justinhaaheim/version-manager is a comprehensive version tracking system for JavaScript/TypeScript projects. It provides granular control over different aspects of application versioning, particularly useful for projects with complex versioning needs such as:
- Semantic versioning for code changes
- Build numbers for app store submissions
- Runtime versions for OTA update compatibility
- Release versions for public-facing displays

## Development Commands

### Code Quality (ALWAYS RUN AFTER CHANGES)
- `bun run signal` - Run all checks sequentially (TypeScript, ESLint, Prettier)
- `bun run ts-check` - TypeScript compilation check (no emit)
- `bun run lint` - ESLint with max 0 warnings
- `bun run lint:fix` - Auto-fix ESLint issues
- `bun run prettier` - Format code with Prettier

### Version Management
- `bun run version` - Interactive version management
- `bun run version:bump` - Increment code version only
- `bun run version:bump-for-build` - Increment both code version and build number
- `bun run version:build-only` - Increment build number only
- `bun run version:show` - Show current versions
- `bun run version:history` - Show version history

## Module Organization
- **NO barrel files**: Never use `index.{ts,tsx,js,jsx}` files that only re-export other modules
- **Direct imports only**: Always import directly from the specific module file
- **No directory index pattern**: Don't create a directory with an index file when a single module file would suffice

## Important General Guidelines

Always follow the important guidelines in @docs/prompts/IMPORTANT_GUIDELINES_INLINED.md

Be aware that messages from the user may contain speech-to-text (S2T) artifacts. Ask for clarification if something seems ambiguous or inconsistent with other parts of the message/project, especially if it is consequential to the overall message. S2T Guidelines: @docs/prompts/S2T_GUIDELINES.md