import { pgEnum } from "drizzle-orm/pg-core";
export const renderDeliveryMode = pgEnum("render_delivery_mode", ["chat", "remote-mcp", "local-mcp"]);
