const tools = new Map();

export function registerTool(tool) {
  if (!tool?.name || typeof tool.run !== "function") {
    throw new Error("tool");
  }
  tools.set(tool.name, tool);
}

export function listTools() {
  return [...tools.values()].map(({ name, description, parameters }) => ({
    type: "function",
    function: { name, description, parameters },
  }));
}

export function getTool(name) {
  return tools.get(name) || null;
}
