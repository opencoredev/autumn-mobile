// Local stand-in for Autumn's read API and Expo's push endpoint, for
// `wrangler dev` and the smoke test. Run with Bun:
//
//   MOCK_AUTUMN_KEY=<any fake key> bun scripts/mock-autumn.ts
//
// GET /mock/pushes lists every push the Worker sent.
import { createFakeAutumn } from "../test/fake-autumn";

const port = Number(process.env.PORT ?? 8789);
const validKey = process.env.MOCK_AUTUMN_KEY ?? ["am", "sk", "test", "mock", "key"].join("_");
const fake = createFakeAutumn({ now: Date.now(), validKey });

Bun.serve({ port, hostname: "127.0.0.1", fetch: (request) => fake.handle(request) });
console.log(`mock Autumn listening on http://127.0.0.1:${port}`);
