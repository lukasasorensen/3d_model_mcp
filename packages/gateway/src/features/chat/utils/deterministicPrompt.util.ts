type Intent = "create" | "width" | "gusset" | "export" | "inspect";

export function normalizeCadPrompt(message: string): string {
  return message.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function classify(message: string): Intent {
  const prompt = normalizeCadPrompt(message);
  if (/export|3mf/.test(prompt)) return "export";
  if (/gusset|reinforc/.test(prompt)) return "gusset";
  if (/100\s*mm|widen|width/.test(prompt)) return "width";
  if (/create|make|bracket|model|part/.test(prompt)) return "create";
  return "inspect";
}

export function canonicalSource(intent: Intent): string {
  const width = intent === "width" || intent === "gusset" ? 100 : 80;
  const holeX = width === 100 ? 35 : 25;
  const gussets =
    intent === "gusset"
      ? `
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
gusset(-35); gusset(35);`
      : "";
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
