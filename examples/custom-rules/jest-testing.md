---
paths: "*/__tests__/*,*/jest.config*,*.test.ts,*.spec.ts"
---

# Jest Testing Conventions

## Test Structure

- Use `describe` for logical grouping, `it` for individual test cases.
- Test file should mirror source file path: `src/user.ts` → `src/__tests__/user.test.ts`

## Naming

- `describe('UserService')` — the unit under test
- `it('should create a user when valid data is provided')` — behavior-driven naming

## Assertions

- Prefer `expect().toBe()` / `toEqual()` over snapshot tests for critical logic.
- Use `toMatchSnapshot()` only for UI/structure output.

## Mocking

- Mock external services at the boundary (HTTP, DB, filesystem).
- Never mock modules you own.

## Coverage

- Every public function must have at least one test.
- Error paths must be tested (not just happy paths).
