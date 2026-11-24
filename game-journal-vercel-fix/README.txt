# Game Journal Vercel build fix

This patch fixes the two TypeScript build problems shown in the Vercel log:

1. Removes the unused `ApiError` import from `src/App.tsx`.
2. Adds `src/vite-env.d.ts` with Vite's client type reference so TypeScript recognizes `import.meta.env`.

## Apply on Windows

1. Extract this ZIP into the **Git repository root** (the folder where `.git` is located).
2. Open PowerShell in that folder.
3. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\apply-vercel-fix.ps1
```

4. Commit and push:

```powershell
git add .
git commit -m "Fix Vercel TypeScript build"
git push
```

Vercel should automatically deploy the new commit.

The script supports either a repository with `notreiyven-game-journal/src/App.tsx` or one where `src/App.tsx` is directly at the repository root.

No `.env` file or credentials are included.
