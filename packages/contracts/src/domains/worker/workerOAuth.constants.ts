/** Worker endpoints and forwarded project tools deliberately share the CAD MCP audience. */
export const WORKER_OAUTH_CLIENT_ID = "theoryfoundry-local-worker";
export const WORKER_OAUTH_CALLBACK = "http://127.0.0.1:43827/oauth/callback";
export const WORKER_OAUTH_SCOPE = "cad:tools offline_access";
