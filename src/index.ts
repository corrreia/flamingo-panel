import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { apiRoutes } from "./api";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());
app.route("/api", apiRoutes);

export default app;
export { ConsoleSession } from "./durable-objects/console-session";
