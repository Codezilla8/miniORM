// Minimal Blog API demonstrating miniorm as a normal npm dependency.
// Deliberately uses only Node's built-in http module (no Express) so the
// example's only "framework" dependency is miniorm itself.
import http from "node:http";
import { ORM, NotFoundError } from "miniorm";

const db = new ORM({ connectionString: process.env.DATABASE_URL });

db.model("user", {
  table: "users",
  relations: { posts: { kind: "hasMany", target: "post", foreignKey: "userId" } },
});
db.model("post", {
  table: "posts",
  relations: { author: { kind: "belongsTo", target: "user", foreignKey: "userId" } },
});

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // e.g. ["users", "1"]

    // POST /users  { name, age }
    if (req.method === "POST" && parts[0] === "users" && parts.length === 1) {
      const body = await readJsonBody(req);
      const user = await db.getModel("user").create({ data: body });
      return send(res, 201, user);
    }

    // GET /users?include=posts
    if (req.method === "GET" && parts[0] === "users" && parts.length === 1) {
      const include = url.searchParams.get("include") === "posts" ? { posts: true } : undefined;
      const users = await db.getModel("user").findMany({ include, orderBy: { name: "asc" } });
      return send(res, 200, users);
    }

    // GET /users/:id?include=posts
    if (req.method === "GET" && parts[0] === "users" && parts.length === 2) {
      const include = url.searchParams.get("include") === "posts" ? { posts: true } : undefined;
      const user = await db
        .getModel("user")
        .findUniqueOrThrow({ where: { id: Number(parts[1]) }, include });
      return send(res, 200, user);
    }

    // POST /posts  { title, userId }
    if (req.method === "POST" && parts[0] === "posts" && parts.length === 1) {
      const body = await readJsonBody(req);
      const post = await db.getModel("post").create({ data: body });
      return send(res, 201, post);
    }

    // POST /transfer-demo  -- shows a transaction: create a user + first post atomically
    if (req.method === "POST" && parts[0] === "transfer-demo" && parts.length === 1) {
      const body = await readJsonBody(req);
      const result = await db.transaction(async (tx) => {
        const user = await tx.user.create({ data: { name: body.name, age: body.age } });
        const post = await tx.post.create({
          data: { title: body.postTitle, userId: user.id },
        });
        return { user, post };
      });
      return send(res, 201, result);
    }

    return send(res, 404, { error: "Not found" });
  } catch (err) {
    if (err instanceof NotFoundError) return send(res, 404, { error: err.message });
    console.error(err);
    return send(res, 500, { error: "Internal server error" });
  }
});

const port = process.env.PORT ?? 3000;
server.listen(port, () => console.log(`Blog API example listening on :${port}`));
