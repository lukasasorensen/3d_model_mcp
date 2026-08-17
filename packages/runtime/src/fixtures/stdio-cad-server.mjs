// G006 test-only child process. It exercises the production stdio adapter without OCI claims.
import { isProductionRendererProvenance } from "@rjls/contracts";
import { connectCadMcpStdio } from "@rjls/mcp";
import { ModelProjectRepository } from "@rjls/model-project";

const workspaceRoot = process.argv[2];
if (!workspaceRoot) throw new Error("fixture workspace is required");

const renderer = {
  async validateAndRender(request) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 10_000);
      const abort = () => { clearTimeout(timer); reject(new Error("cancelled")); };
      request.signal?.addEventListener("abort", abort, { once: true });
      if (request.signal?.aborted) abort();
    });
    throw new Error("fixture render should be cancelled");
  },
};
const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance: isProductionRendererProvenance });
process.stderr.write("rjls stdio fixture ready\n");
await connectCadMcpStdio(repository);
