/* global window */

/** Deliver reconciliation and revision-effect reads before React commits state. */
export async function overlapNextObjectReads(page) {
  await page.evaluate(() => {
    const fetch = window.fetch.bind(window);
    const reads = [];
    window.fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (init?.method || !String(input).includes("/objects")) return response;
      const value = await response.json();
      response.json = () =>
        new Promise((resolve) => {
          reads.push({ current: !String(input).includes("?"), value, resolve });
          if (reads.length !== 2) return;
          window.fetch = fetch;
          const current = reads.find((read) => read.current);
          const revision = reads.find((read) => !read.current);
          current.resolve(current.value);
          queueMicrotask(() => revision.resolve(revision.value));
        });
      return response;
    };
  });
}
