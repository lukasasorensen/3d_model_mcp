export function cycleEdges(edges) {
  // Tarjan components avoid exponential path enumeration on a large DAG.
  let next = 0;
  const indexes = new Map(),
    low = new Map(),
    stack = [],
    active = new Set(),
    cyclic = [];
  function visit(node) {
    indexes.set(node, next);
    low.set(node, next++);
    stack.push(node);
    active.add(node);
    for (const target of edges.get(node) ?? []) {
      if (!indexes.has(target)) {
        visit(target);
        low.set(node, Math.min(low.get(node), low.get(target)));
      } else if (active.has(target))
        low.set(node, Math.min(low.get(node), indexes.get(target)));
    }
    if (low.get(node) !== indexes.get(node)) return;
    const component = new Set();
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      component.add(member);
    } while (member !== node);
    for (const source of component)
      for (const target of edges.get(source) ?? []) {
        if (component.has(target) && (component.size > 1 || source === target))
          cyclic.push([source, target]);
      }
  }
  for (const node of edges.keys()) if (!indexes.has(node)) visit(node);
  return cyclic.sort(
    ([a, b], [c, d]) => a.localeCompare(c) || b.localeCompare(d),
  );
}
