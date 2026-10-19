import { ask as askCore } from "./core.js";
import { registerTool } from "./registry.js";
import { addToCartTool, getCartTool } from "./tools/cart.js";
import { searchProductsTool } from "./tools/catalog.js";

registerTool(searchProductsTool);
registerTool(getCartTool);
registerTool(addToCartTool);

export function ask(input) {
  return askCore(input);
}
