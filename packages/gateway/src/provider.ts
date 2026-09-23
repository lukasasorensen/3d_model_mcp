import { BaseChatModel, type BaseChatModelParams, type BindToolsInput } from "@langchain/core/language_models/chat_models";
import { AIMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import type { Runnable } from "@langchain/core/runnables";
import type { ChatRequest } from "@rjls/contracts";

export interface CadChatProvider {
  readonly id: string;
  createModel(request: ChatRequest, requestId: string): BaseChatModel;
}

type Intent = "create" | "width" | "gusset" | "export" | "inspect";

export function normalizeCadPrompt(message: string): string {
  return message.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function classify(message: string): Intent {
  const prompt = normalizeCadPrompt(message);
  if (/export|3mf/.test(prompt)) return "export";
  if (/gusset|reinforc/.test(prompt)) return "gusset";
  if (/100\s*mm|widen|width/.test(prompt)) return "width";
  if (/create|make|bracket|model|part/.test(prompt)) return "create";
  return "inspect";
}

function canonicalSource(intent: Intent): string {
  const width = intent === "width" || intent === "gusset" ? 100 : 80;
  const holeX = width === 100 ? 35 : 25;
  const gussets = intent === "gusset" ? `
module gusset(x) {
  translate([x, upright_y_min, base_thickness])
    polyhedron(
      points = [
        [-gusset_thickness/2, 0, 0], [-gusset_thickness/2, -gusset_leg, 0], [-gusset_thickness/2, 0, gusset_leg],
        [ gusset_thickness/2, 0, 0], [ gusset_thickness/2, -gusset_leg, 0], [ gusset_thickness/2, 0, gusset_leg]
      ],
      faces = [[0,2,1], [3,4,5], [0,1,4,3], [1,2,5,4], [2,0,3,5]],
      convexity = 2
    );
}
gusset(-35); gusset(35);` : "";
  return `$fn = 48;
width = ${width};
depth = 40;
base_thickness = 6;
upright_thickness = 6;
upright_height = 40;
upright_y_min = 14;
hole_diameter = 5;
hole_y = -10;
hole_x = ${holeX};
gusset_thickness = 6;
gusset_leg = 20;
difference() {
  union() {
    translate([-width/2, -depth/2, 0]) cube([width, depth, base_thickness]);
    translate([-width/2, upright_y_min, base_thickness])
      cube([width, upright_thickness, upright_height]);${gussets}
  }
  for (x = [-hole_x, hole_x])
    translate([x, hole_y, -1]) cylinder(h = base_thickness + 2, d = hole_diameter);
}`;
}

function contentText(message: BaseMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content.map((part) => {
    if (typeof part === "string") return part;
    if ("text" in part) return String(part.text);
    return "";
  }).join("");
}

function parsedToolMessages(messages: BaseMessage[]): Array<{ name: string; value: Record<string, unknown> }> {
  return messages.filter(ToolMessage.isInstance).flatMap((message) => {
    try {
      return message.name ? [{ name: message.name, value: JSON.parse(contentText(message)) as Record<string, unknown> }] : [];
    } catch {
      // Invalid tool content is never authoritative state. Ignoring it makes the
      // deterministic mock retry through MCP until the bounded tool limit fails closed.
      return [];
    }
  });
}

class DeterministicCadChatModel extends BaseChatModel {
  private tools: BindToolsInput[] = [];
  private callIndex = 0;

  constructor(
    private readonly request: ChatRequest,
    private readonly requestId: string,
    fields: BaseChatModelParams = {},
  ) {
    super(fields);
  }

  _llmType(): string { return "rjls-deterministic-cad"; }

  bindTools(tools: BindToolsInput[]): Runnable {
    const bound = new DeterministicCadChatModel(this.request, this.requestId);
    bound.tools = [...tools];
    return bound;
  }

  private call(name: string, args: Record<string, unknown>): AIMessage {
    this.callIndex += 1;
    const id = `${this.requestId}-t${this.callIndex}`;
    return new AIMessage({ content: "", tool_calls: [{ id, name, args, type: "tool_call" }] });
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const available = new Set(this.tools.map((candidate) => "name" in candidate ? String(candidate.name) : ""));
    const invoke = (name: string, args: Record<string, unknown>) => {
      if (!available.has(name)) throw new Error("Required CAD tool is unavailable.");
      return this.call(name, args);
    };
    const intent = classify(this.request.message);
    const results = parsedToolMessages(messages);
    const last = results.at(-1);
    const stateResult = results.find((item) => item.name === "get_project_state")?.value;
    const state = stateResult?.state as { currentRevision?: string | null } | undefined;
    const currentRevision = state?.currentRevision ?? null;
    const rejected = results.filter((item) => item.name === "validate_and_render" && (item.value.candidate as { state?: string } | undefined)?.state === "REJECTED").length;
    let message: AIMessage;

    if (!last) {
      message = invoke("get_project_state", { projectId: this.request.projectId });
    } else if (last.name === "get_project_state") {
      if (intent === "export" && currentRevision) message = invoke("export_model", { projectId: this.request.projectId, revision: currentRevision, format: "3mf" });
      else if ((intent === "width" || intent === "gusset") && currentRevision) message = invoke("read_model_source", { projectId: this.request.projectId, revision: currentRevision });
      else if (intent === "create" && !currentRevision) message = invoke("propose_model_source", { projectId: this.request.projectId, parentRevision: null, source: canonicalSource(intent) });
      else message = new AIMessage({ content: currentRevision ? "The current CAD revision is ready." : "The project is blank. Ask me to create a functional bracket." });
    } else if (last.name === "read_model_source") {
      message = invoke("propose_model_source", { projectId: this.request.projectId, parentRevision: currentRevision, source: canonicalSource(intent) });
    } else if (last.name === "propose_model_source") {
      const candidateId = (last.value.candidate as { candidateId?: string } | undefined)?.candidateId;
      message = candidateId ? invoke("validate_and_render", { projectId: this.request.projectId, candidateId, previewProfile: "standard" }) : new AIMessage({ content: "The CAD proposal was not accepted." });
    } else if (last.name === "validate_and_render") {
      const candidate = last.value.candidate as { candidateId?: string; state?: string; parentRevision?: string | null } | undefined;
      if (candidate?.state === "VALID" && candidate.candidateId) message = invoke("promote_candidate", { projectId: this.request.projectId, candidateId: candidate.candidateId, expectedParentRevision: candidate.parentRevision ?? null });
      else if (candidate?.state === "REJECTED" && rejected <= 2) message = invoke("propose_model_source", { projectId: this.request.projectId, parentRevision: currentRevision, source: canonicalSource(intent) });
      else throw new Error("REPAIR_LIMIT_EXCEEDED");
    } else if (last.name === "promote_candidate") {
      message = new AIMessage({ content: "The validated CAD revision is now current." });
    } else if (last.name === "export_model") {
      message = new AIMessage({ content: "The verified export is ready and its download has been requested." });
    } else {
      message = new AIMessage({ content: "The CAD request is complete." });
    }
    return { generations: [{ text: contentText(message), message }], llmOutput: {} };
  }
}

export class DeterministicMockCadProvider implements CadChatProvider {
  readonly id = "deterministic-mock";
  createModel(request: ChatRequest, requestId: string): BaseChatModel {
    return new DeterministicCadChatModel(request, requestId);
  }
}

export function createCadProvider(name = process.env.RJLS_CHAT_PROVIDER ?? "mock"): CadChatProvider {
  if (name === "mock") return new DeterministicMockCadProvider();
  throw new Error("Configured chat provider is unavailable; install and register an explicit adapter.");
}
