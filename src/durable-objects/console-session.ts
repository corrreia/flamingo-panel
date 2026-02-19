import type { Env } from "../env";

export class ConsoleSession implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    return new Response("Console session stub", { status: 200 });
  }
}
