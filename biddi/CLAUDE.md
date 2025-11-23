# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository

## Commands

### Development

- `pnpm dev` - Start development server (http://localhost:3000)
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint to check code quality

### Important Notes

- No test commands currently exist - testing infrastructure needs to be set up
- Use `pnpm` for package management (not npm or yarn)
- The project uses strict TypeScript checking

## Architecture Overview

### Technology Stack

- **Framework**: Next.js 16 with React 19 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: TailwindCSS v4
- **State Management**: React Query (to be added)
- **Backend/Auth**: Supabase
- **UI Components**: Radix UI + custom shadcn/ui components (to be added)

### Project Structure

```
biddi/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── api/          # API route handlers
│   │   ├── (auth)/       # Authenticated routes group
│   │   └── (public)/     # Public routes group
│   ├── components/       # React components
│   │   ├── shared/       # Shared components across features
│   │   ├── ui/           # Base UI components (shadcn/ui)
│   │   └── [features]/   # Feature-specific components
│   ├── lib/              # Core business logic
│   │   ├── supabase/     # Supabase client and utilities
│   │   └── [modules]/    # Domain modules following this pattern:
│   │       ├── commands/ # Write operations
│   │       ├── queries/  # Read operations
│   │       ├── services/ # Business logic
│   │       ├── entities/ # Type definitions
│   │       ├── utils/    # Helper functions
│   │       └── constants/# Module constants
│   ├── hooks/            # Custom React hooks
│   └── types/            # Shared TypeScript type definitions
├── public/               # Static assets
└── .env.local            # Environment variables (not committed)
```

### Key Architectural Patterns

1. **Module Organization**: Each domain has its own module in `/src/lib/[module-name]` with standardized subfolders for commands, queries, services, entities, utils, and constants.

2. **Authentication**: Use Supabase for auth. Protected routes should be in route groups like `(auth)`. Check user session with Supabase hooks.

3. **Component Structure**: Components are organized by feature area. Shared components go in `/src/components/shared/`, UI primitives in `/src/components/ui/`.

4. **Type Safety**: The project uses TypeScript strictly. Prefer `type` over `interface` for type definitions.

5. **Server Components**: Leverage Next.js 16 App Router server components by default. Use `'use client'` directive only when client-side interactivity is needed.

### Coding Standards

- Use functional components with TypeScript
- Prefer `type` over `interface`
- Use descriptive variable names
- Keep functions small and focused
- Use TailwindCSS for styling (avoid inline styles)
- Follow existing file naming conventions (kebab-case for files)
- Implement proper error handling
- Use React Query for client-side data fetching
- Use Server Actions or Route Handlers for mutations

### Common Development Tasks

When implementing new features:

1. Create domain module in `/src/lib/[feature-name]/` with standard subfolders
2. Define types in `/src/lib/[feature-name]/entities/`
3. Use Route Handlers in `/src/app/api/` for API endpoints
4. Create React components in appropriate `/src/components/` subfolder
5. Add page routes in `/src/app/` following App Router conventions
6. Use existing UI components from `/src/components/ui/` where possible
7. Leverage Server Components for data fetching when possible

### Environment Variables

Required environment variables (stored in `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
